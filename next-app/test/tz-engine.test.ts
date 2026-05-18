import { describe, it, expect, beforeEach } from 'vitest';
import { runTizhinei, type TzInput } from '@/lib/tz/engine';

// 与 test/sim.test.ts 同款 mulberry32 种子，确定化蒙特卡洛
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
  });

  it('体制内三件套使 FIRE 不晚于裸算（粗算单调性）', () => {
    const r = runTizhinei(base);
    expect(r.naiveFinalP50).toBeLessThanOrEqual(r.finalP50 * 1.0001);
  });

  it('退休年龄越早，yearsToFire 不会更小为负且为数字或 null', () => {
    const r = runTizhinei({ ...base, targetRetireAge: 45 });
    expect(r.yearsToFire === null || r.yearsToFire >= 0).toBe(true);
  });
});
