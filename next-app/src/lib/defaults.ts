/* defaults.ts — 默认 plan 工厂 + 迁移（与 vanilla demo 行为一致） */
import { newId, _thisYear } from './utils';
// @ts-ignore - js library
import { ASSET_CATEGORY_DEFAULTS } from './simulation';

const _y = _thisYear;

export const PLAN_COLORS = ['#b91c1c', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2'];

// 默认支出分类（按一线城市消费比例 + 类别独立通胀率）
export const EXPENSE_CATEGORY_PRESET = [
  { name: '住房',  share: 0.40, inflBoost: 0.000 },
  { name: '餐饮',  share: 0.22, inflBoost: 0.000 },
  { name: '交通',  share: 0.08, inflBoost: 0.000 },
  { name: '医疗',  share: 0.06, inflBoost: 0.030 },
  { name: '教育',  share: 0.07, inflBoost: 0.020 },
  { name: '娱乐',  share: 0.10, inflBoost: 0.000 },
  { name: '其他',  share: 0.07, inflBoost: 0.000 },
];

export function splitExpenseToCategories(totalMonthly: number, baseInfl: number) {
  return EXPENSE_CATEGORY_PRESET.map(c => ({
    id: newId(),
    name: c.name,
    monthly: Math.round(totalMonthly * c.share),
    inflationRate: baseInfl + c.inflBoost,
  }));
}

// 把类别默认 ret/vol 注入资产
function withDef<T extends { type: string }>(asset: T): T & { expectedReturn?: number; volatility?: number } {
  const d = (ASSET_CATEGORY_DEFAULTS as any)[asset.type];
  return d ? { ...asset, expectedReturn: d.ret, volatility: d.vol } : asset;
}

export function defaultPlan(name = '平衡', colorIdx = 0): any {
  return {
    id: newId(),
    name,
    color: PLAN_COLORS[colorIdx % PLAN_COLORS.length],
    assets: [
      withDef({ id: newId(), type: 'cash',  name: '现金 / 余额宝',  amountCny: 80000,  status: 'ok' }),
      withDef({ id: newId(), type: 'fund',  name: '易方达蓝筹精选', code: '005827',   amountCny: 84000,  unitPrice: 1.68, dcaAmount: 50,   dcaFreq: 'day',   status: 'idle' }),
      withDef({ id: newId(), type: 'fund',  name: '中欧医疗健康A',  code: '003095',   amountCny: 34600,  unitPrice: 1.73, dcaAmount: 200,  dcaFreq: 'week',  status: 'idle' }),
      withDef({ id: newId(), type: 'stock', name: '沪深300ETF',     code: 'sh510300', amountCny: 496000, unitPrice: 4.96, dcaAmount: 2000, dcaFreq: 'month', status: 'idle' }),
      withDef({ id: newId(), type: 'gold',  name: '沪金99',         code: 'AU9999',   amountCny: 50000,  unitPrice: 1030, dcaAmount: 500,  dcaFreq: 'month', status: 'idle' }),
      withDef({ id: newId(), type: 'ipa',   name: '个人养老金账户', amountCny: 0,      dcaAmount: 1000,  dcaFreq: 'month', status: 'ok' }),
    ],
    people: [
      {
        id: 'p1',
        name: '本人',
        birthYear: _y - 30,
        retireYear: _y + 25,
        incomeStreams: [
          { id: newId(), name: '工资/薪水', type: 'gross', monthlyAmount: 30000, annualGrowth: 0.03, startYear: _y, endYear: _y + 30, ownerId: 'p1' },
        ],
      },
    ],
    incomeStreams: [
      { id: newId(), name: '工资/薪水', type: 'gross', monthlyAmount: 30000, annualGrowth: 0.03, startYear: _y, endYear: _y + 30 },
    ],
    taxConfig: {
      city: 'shanghai',
      customRates: null,
      specialDeductions: {
        rent: 0, mortgage: 0, kidsEducation: 0, infant: 0,
        parentsCare: 0, education: 0, illness: 0,
      },
    },
    stages: {
      working:    { monthlyExpense: null },
      transition: { enabled: false, startYear: _y + 20, monthlyExpense: null, incomeMultiplier: 0.5 },
      retired:    { startYear: _y + 25, monthlyExpense: null },
    },
    glidePath: { enabled: false, equityFloorPct: 30 },
    pension: {
      enabled: false,
      yearsContributed: 5,
      contributionIndex: 1.0,
      currentSocialAverage: 11000,
      personalAccountBalance: 50000,
      payoutMonths: 139,
    },
    healthcareGapMonthly: 500,
    liabilities: [],
    goals: [],
    expenseCategories: splitExpenseToCategories(12000, 0.025),
    target: 10000000,
    expense: 12000,
    retirementExpense: null,
    ret: 0.07,
    vol: 0.18,
    infl: 0.025,
    incomeGrowth: 0.03,
    taxDrag: 0.005,
    swr: 0.035,
    withdrawalStrategy: 'fixed',
    years: 30,
    birthYear: _y - 30,
    events: [],
  };
}
