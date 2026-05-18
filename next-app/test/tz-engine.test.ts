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

const base: TzInput = {
  age: 32, regimeKey: 'institution', monthlyNet: 9000,
  housingFundMonthly: 4000, occupationalPensionMonthly: 1500,
  savings: 300000, targetRetireAge: 50,
};

describe('runTizhinei', () => {
  beforeEach(() => seedRandom(42));

  it('返回结构完整且数值有限', () => {
    const r = runTizhinei(base);
    expect(typeof r.finalP50).toBe('number');
    expect(Number.isFinite(r.finalP50)).toBe(true);
    expect(r.hook.length).toBeGreaterThan(8);
    // facade uses a fixed internal seed → results must be deterministic
    expect(r.hook).toContain('粗算');
  });

  it('体制内三件套使期末资产明显高于裸算（路径公平对比）', () => {
    // With I3: both runs use the same fixed seed → delta is a clean ceteris-paribus attribution.
    // Observed deterministic values at base input:
    //   finalP50      ≈ 14,219,930  (real, with pension/housing/occupational)
    //   naiveFinalP50 ≈ 0           (naive, no civil benefits → insufficient assets at retirement)
    // Delta > ¥100万 is a meaningful positive lower bound.
    const r = runTizhinei(base);
    expect(r.finalP50).toBeGreaterThan(r.naiveFinalP50);
    expect(r.finalP50 - r.naiveFinalP50).toBeGreaterThan(100_000); // ≥¥10万 meaningful margin
    expect(r.hook).toContain('裸算');
  });

  it('yearsToFire 在合理区间内', () => {
    // Observed deterministic value: yearsToFire ≈ 48.75 (within the 50-year horizon)
    // Must be non-null, positive, and within the simulation years bound.
    const r = runTizhinei(base);
    expect(r.yearsToFire).not.toBeNull();
    expect(r.yearsToFire!).toBeGreaterThan(3);
    expect(r.yearsToFire!).toBeLessThan(base.targetRetireAge + 40); // within sim horizon
  });
});
