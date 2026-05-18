// 体制内 FIRE 测算门面 —— 纯函数，无 UI/store 依赖。
// 复用现有引擎 runSim；本期不修引擎口径，结果按"粗算"对外。
// @ts-ignore - js engine
import { runSim } from '@/lib/simulation';
import { regimeByKey, CHONGQING_SOCIAL_AVG } from '@/lib/civilService';
import { _thisYear, newId } from '@/lib/utils';

export interface TzInput {
  age: number;
  regimeKey: string;            // civil | cangguan | institution | soe | enterprise
  monthlyNet: number;           // 月到手
  housingFundMonthly: number;   // 公积金月缴
  occupationalPensionMonthly: number; // 职业年金月缴
  savings: number;              // 现有存款
  targetRetireAge: number;      // 目标退休年龄
}

export interface TzResult {
  yearsToFire: number | null;
  naiveYearsToFire: number | null;
  finalP50: number;
  naiveFinalP50: number;
  retireExpenseAssumed: number;
  hook: string;
}

function buildPlan(inp: TzInput, civilOn: boolean): any {
  const regime = regimeByKey(inp.regimeKey);
  const contributionIndex = regime?.contributionIndex ?? 1.0;

  const birthYear = _thisYear - inp.age;
  const retireYear = birthYear + inp.targetRetireAge;
  const retireExpense = Math.round(inp.monthlyNet * 0.7);

  // 粗算养老金月领 = 按重庆社平 × 缴费指数 / 120 (简化个人账户)
  // 养老金仅在 civilOn 时生效
  const yearsContributed = Math.max(5, inp.targetRetireAge - 22);

  return {
    id: newId(),
    name: '体制内粗算',
    color: '#2563eb',

    assets: [{
      id: newId(),
      type: 'fund',
      name: '储蓄/投资',
      amountCny: inp.savings,
      expectedReturn: 0.06,
      volatility: 0.12,
      dcaAmount: 0,
      dcaFreq: 'month',
      status: 'ok',
    }],

    people: [{
      id: 'p1',
      name: '本人',
      birthYear,
      retireYear,
      incomeStreams: [{
        id: newId(),
        name: '工资',
        type: 'net',
        monthlyAmount: inp.monthlyNet,
        annualGrowth: 0.02,
        startYear: _thisYear,
        endYear: null,
        freq: 'month',
        ownerId: 'p1',
      }],
    }],

    incomeStreams: [],

    taxConfig: {
      city: 'chongqing',
      customRates: null,
      specialDeductions: {
        rent: 0, mortgage: 0, kidsEducation: 0, infant: 0,
        parentsCare: 0, education: 0, illness: 0,
      },
    },

    stages: {
      working: { monthlyExpense: null },
      transition: { enabled: false, startYear: retireYear, monthlyExpense: null, incomeMultiplier: 0.5 },
      retired: { startYear: retireYear, monthlyExpense: retireExpense },
    },

    glidePath: { enabled: false, equityFloorPct: 30 },

    pension: {
      enabled: civilOn,
      yearsContributed,
      contributionIndex,
      currentSocialAverage: CHONGQING_SOCIAL_AVG,
      personalAccountBalance: Math.round(inp.monthlyNet * 0.08 * 12 * yearsContributed),
      payoutMonths: 139,
    },

    healthcareGapMonthly: civilOn ? 300 : 500,

    housingFund: {
      enabled: civilOn && inp.housingFundMonthly > 0,
      monthlyContribution: inp.housingFundMonthly,
      balance: 0,
      creditRate: 0.015,
      offsetMortgage: false,
    },

    occupationalPension: {
      enabled: civilOn && inp.occupationalPensionMonthly > 0,
      balance: 0,
      monthlyContribution: inp.occupationalPensionMonthly,
      creditRate: 0.04,
      payout: 'monthly',
    },

    liabilities: [],
    goals: [],
    expenseCategories: [],
    events: [],

    target: 10_000_000,
    expense: retireExpense,
    retirementExpense: retireExpense,

    ret: 0.06,
    vol: 0.12,
    infl: 0.025,
    incomeGrowth: 0.02,
    taxDrag: 0.005,
    swr: 0.035,
    withdrawalStrategy: 'fixed',
    years: Math.max(50, (retireYear - _thisYear) + 40),
    birthYear,
  };
}

export function runTizhinei(inp: TzInput): TzResult {
  const real = runSim(buildPlan(inp, true));
  const naive = runSim(buildPlan(inp, false));
  const retireExpenseAssumed = Math.round(inp.monthlyNet * 0.7);

  const wan = (n: number) => Math.round(n / 10000);
  const delta = wan(real.finalP50 - naive.finalP50);
  const hook = delta > 0
    ? `这是粗算。算上编制养老金/公积金/职业年金，你期末资产比裸算多约 ¥${delta} 万——这三块多数人自己算时漏了或算错。`
    : `这是粗算。你的体制内三件套对结果影响有限，真正的变量在支出与退休年龄——精算版给你拆开。`;

  return {
    yearsToFire: real.yearsToFire ?? null,
    naiveYearsToFire: naive.yearsToFire ?? null,
    finalP50: real.finalP50,
    naiveFinalP50: naive.finalP50,
    retireExpenseAssumed,
    hook,
  };
}
