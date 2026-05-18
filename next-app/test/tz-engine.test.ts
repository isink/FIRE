import { describe, it, expect, beforeEach } from 'vitest';
import { runTizhinei, type TzInput } from '@/lib/tz/engine';

// 与 test/sim.test.ts 同款 mulberry32 种子；facade 内部自带固定种子，
// 此处的 beforeEach 不影响 facade 结果，保留以兼容其他潜在用途。
function seedRandom(seed: number) {
  let a = seed >>> 0;
  globalThis.Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// targetRetireAge: 60 so the naive worker (basic 社保 only, no HF/OP) stays
// non-bankrupt — pension starts at 60, so retiring at 60 immediately activates it.
const base: TzInput = {
  age: 32, regimeKey: 'institution', monthlyNet: 9000,
  housingFundMonthly: 4000, occupationalPensionMonthly: 1500,
  savings: 300000, targetRetireAge: 60,
};

describe('runTizhinei', () => {
  beforeEach(() => seedRandom(42));

  // Test 1 — structure: both outcomes finite, naiveFinalP50 > 0 (basic pension kept the
  // naive 普通企业 worker non-bankrupt — this guards the key model fix).
  it('返回结构完整且数值有限', () => {
    const r = runTizhinei(base);
    expect(typeof r.finalP50).toBe('number');
    expect(Number.isFinite(r.finalP50)).toBe(true);
    // Observed deterministic value: naiveFinalP50 ≈ 2,223,607 (basic pension enabled, retire@60)
    expect(Number.isFinite(r.naiveFinalP50)).toBe(true);
    expect(r.naiveFinalP50).toBeGreaterThan(0); // basic pension keeps naive worker non-bankrupt
    expect(r.hook.length).toBeGreaterThan(8);
    // facade uses a fixed internal seed → results must be deterministic
    expect(r.hook).toContain('粗算');
  });

  // Test 2 — 体制内 advantage: real meaningfully exceeds naive, hook mentions 普通企业.
  // Observed deterministic values at base input:
  //   finalP50      ≈ 37,809,061  (real: pension index 1.5 + HF ¥4000 + OP ¥1500)
  //   naiveFinalP50 ≈  2,223,607  (naive: basic pension index 1.0, no HF, no OP)
  //   delta         ≈ ¥3559万
  // Assert > 70% of observed delta as meaningful lower bound ≈ ¥2491万 ≈ 24,910,000 CNY.
  it('体制内三件套使期末资产明显高于普通企业基线（路径公平对比）', () => {
    // With I3: both runs use the same fixed seed → delta is a clean ceteris-paribus attribution.
    const r = runTizhinei(base);
    expect(r.finalP50).toBeGreaterThan(r.naiveFinalP50);
    expect(r.finalP50 - r.naiveFinalP50).toBeGreaterThan(24_910_000); // ≥70% of observed ¥3559万
    expect(r.hook).toContain('普通企业');
  });

  // Test 3 — yearsToFire sane: not null, > 3, within sim years bound.
  // Observed deterministic value: yearsToFire = 37.
  // Sim years = max(50, (retireYear - thisYear) + 40) = max(50, 28+40) = 68.
  it('yearsToFire 在合理区间内', () => {
    const r = runTizhinei(base);
    expect(r.yearsToFire).not.toBeNull();
    expect(r.yearsToFire!).toBeGreaterThan(3);
    // Sim horizon: (targetRetireAge - age) + 40 post-retire = 28 + 40 = 68 years
    expect(r.yearsToFire!).toBeLessThan(68);
    // Pin to observed range with ±8-year tolerance (mirrors sim.test.ts style)
    expect(r.yearsToFire!).toBeGreaterThan(29);   // observed 37, lower bound 37-8=29
    expect(r.yearsToFire!).toBeLessThan(45);       // observed 37, upper bound 37+8=45
  });

  // Test 4 — 普通企业 regime ⇒ near-zero advantage.
  // When the user selects enterprise (contributionIndex = 1.0) with no HF or OP
  // (a genuine 普通企业 worker), real and naive use identical parameters,
  // so the engine produces the same path and finalP50 ≈ naiveFinalP50 to within 2%.
  // Proof: hook falls back to the "有限" message, not the "多攒" message.
  it('普通企业 regime ⇒ 增量近零，体制内优势归零', () => {
    // Enterprise worker: no occupational pension (enterprise doesn't have it),
    // no housing fund top-up beyond the baseline, contributionIndex = 1.0 same as naive.
    const r = runTizhinei({
      ...base,
      regimeKey: 'enterprise',
      housingFundMonthly: 0,
      occupationalPensionMonthly: 0,
    });
    // Both runs: pension enabled with index 1.0, HF off, OP off → identical plans
    expect(Math.abs(r.finalP50 - r.naiveFinalP50)).toBeLessThan(r.finalP50 * 0.02);
    // Hook must be the fallback (no "多攒" → the "增量有限" branch)
    expect(r.hook).not.toContain('多攒');
    expect(r.hook).toContain('粗算');
  });
});
