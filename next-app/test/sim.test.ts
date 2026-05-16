import { describe, it, expect, beforeEach } from 'vitest';
// @ts-ignore - js engine
import { runSim } from '@/lib/simulation';
import { defaultPlan } from '@/lib/defaults';

/**
 * 仿真引擎黄金测试 —— 这产品的命根子是 runSim 正确。
 * 用种子化 Math.random 让蒙特卡洛确定化，断言用宽容差：
 * 容差能吸收无害重构，但抓得住"改引擎把数算错/漏算事件"这类真回归。
 */

// mulberry32 seeded PRNG
function seedRandom(seed: number) {
  let a = seed >>> 0;
  globalThis.Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
beforeEach(() => seedRandom(12345));

const _y = new Date().getFullYear();

function familyPlan(extra: Partial<any> = {}) {
  return {
    id: 'fam', name: '我家', color: '#b91c1c',
    assets: [{ id: 'a1', type: 'fund', name: '投资组合', amountCny: 400000, expectedReturn: 0.08, volatility: 0.15, dcaAmount: 0, dcaFreq: 'month', status: 'ok' }],
    people: [
      { id: 'p1', name: '本人', birthYear: 1997, retireYear: 2060, incomeStreams: [
        { id: 's1', name: '工资', type: 'net', monthlyAmount: 6546, annualGrowth: 0.02, startYear: 2026, endYear: null, freq: 'month', ownerId: 'p1' },
        { id: 's2', name: '年终奖', type: 'net', monthlyAmount: 100000, annualGrowth: 0.02, startYear: 2026, endYear: null, freq: 'year', ownerId: 'p1' },
      ] },
      { id: 'p2', name: '配偶', birthYear: 1998, retireYear: 2056, incomeStreams: [
        { id: 's3', name: '配偶工资', type: 'net', monthlyAmount: 8200, annualGrowth: 0.02, startYear: 2026, endYear: null, freq: 'month', ownerId: 'p2' },
      ] },
    ],
    incomeStreams: [],
    taxConfig: { city: 'shanghai', customRates: null, specialDeductions: {} },
    stages: { working: { monthlyExpense: null }, transition: { enabled: false }, retired: { startYear: 2060, monthlyExpense: 9000 } },
    glidePath: { enabled: false, equityFloorPct: 30 },
    pension: { enabled: true, yearsContributed: 6, contributionIndex: 1.8, currentSocialAverage: 8000, personalAccountBalance: 200000, payoutMonths: 139 },
    healthcareGapMonthly: 300,
    liabilities: [],
    goals: [
      { id: 'g1', name: '大娃学费', year: 2049, amount: 200000, priority: 1 },
      { id: 'g2', name: '二娃学费', year: 2052, amount: 200000, priority: 1 },
    ],
    expenseCategories: [
      { id: 'e1', name: '住房', monthly: 2800, inflationRate: 0.025 },
      { id: 'e2', name: '餐饮', monthly: 1540, inflationRate: 0.025 },
      { id: 'e3', name: '交通', monthly: 560, inflationRate: 0.025 },
      { id: 'e4', name: '医疗', monthly: 420, inflationRate: 0.055 },
      { id: 'e5', name: '教育', monthly: 490, inflationRate: 0.045 },
      { id: 'e6', name: '娱乐', monthly: 700, inflationRate: 0.025 },
      { id: 'e7', name: '其他', monthly: 490, inflationRate: 0.025 },
    ],
    events: [
      { id: 'v1', name: '生1孩', year: 2028, amount: 0, monthly: true, monthlyDelta: -3000 },
      { id: 'v2', name: '生2孩', year: 2031, amount: 0, monthly: true, monthlyDelta: -3000 },
      { id: 'v5', name: '公积金转投', year: 2040, amount: 0, monthly: true, monthlyDelta: 6000 },
      { id: 'v6', name: '职业年金', year: 2060, amount: 2500000, monthly: false, monthlyDelta: 0 },
    ],
    target: 10000000, expense: 7000, retirementExpense: null,
    ret: 0.08, vol: 0.15, infl: 0.025, incomeGrowth: 0.02, taxDrag: 0.005, swr: 0.035,
    withdrawalStrategy: 'fixed', years: 50, birthYear: 1997,
    ...extra,
  };
}

describe('runSim 基本健全性', () => {
  it('默认 plan 产出结构完整、概率在 [0,1]', () => {
    const r = runSim(defaultPlan());
    expect(Array.isArray(r.p50)).toBe(true);
    expect(r.p50.length).toBeGreaterThan(2);
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(1);
    expect(r.p50.every((v: number) => Number.isFinite(v) && v >= 0)).toBe(true);
  });
});

describe('报告家庭：与已验证基线对账（宽容差）', () => {
  const r = (() => { seedRandom(12345); return runSim(familyPlan()); })();

  it('起点净值 = 40 万', () => {
    expect(r.initial).toBe(400000);
  });

  it('退休保障极强：成功率 ≥ 90%', () => {
    expect(r.successRate).toBeGreaterThanOrEqual(0.9);
  });

  it('2060(本人退休)组合 P50 落在 2400 万 ~ 4000 万', () => {
    const row = r.yearlyRows.find((x: any) => x.year === 2060);
    expect(row).toBeTruthy();
    expect(row.portfolioP50).toBeGreaterThan(24_000_000);
    expect(row.portfolioP50).toBeLessThan(40_000_000);
  });

  it('终值(2076)显著为正、随复利远高于起点', () => {
    expect(r.finalP50).toBeGreaterThan(50_000_000);
  });
});

describe('回归锁：逐年表必须计入 recurring 事件（曾漏算的真缺陷）', () => {
  it('2028 年支出 > 2027 年支出 ×1.2（生1孩 -3000/月 事件被计入）', () => {
    seedRandom(12345);
    const r = runSim(familyPlan());
    const y27 = r.yearlyRows.find((x: any) => x.year === 2027);
    const y28 = r.yearlyRows.find((x: any) => x.year === 2028);
    expect(y27 && y28).toBeTruthy();
    expect(y28.expense).toBeGreaterThan(y27.expense * 1.2);
  });
});

describe('回归锁：收入「按年」≈ 月额/12（年终奖 freq 特性）', () => {
  it('年终奖 freq=year 10万 与 freq=month 8333 终值接近(±8%)', () => {
    seedRandom(777);
    const yearMode = runSim(familyPlan());
    seedRandom(777);
    const monthMode = runSim(familyPlan({
      people: [
        { id: 'p1', name: '本人', birthYear: 1997, retireYear: 2060, incomeStreams: [
          { id: 's1', name: '工资', type: 'net', monthlyAmount: 6546, annualGrowth: 0.02, startYear: 2026, endYear: null, freq: 'month', ownerId: 'p1' },
          { id: 's2', name: '年终奖', type: 'net', monthlyAmount: 8333, annualGrowth: 0.02, startYear: 2026, endYear: null, freq: 'month', ownerId: 'p1' },
        ] },
        { id: 'p2', name: '配偶', birthYear: 1998, retireYear: 2056, incomeStreams: [
          { id: 's3', name: '配偶工资', type: 'net', monthlyAmount: 8200, annualGrowth: 0.02, startYear: 2026, endYear: null, freq: 'month', ownerId: 'p2' },
        ] },
      ],
    }));
    const diff = Math.abs(yearMode.finalP50 - monthMode.finalP50) / monthMode.finalP50;
    expect(diff).toBeLessThan(0.08);
  });
});
