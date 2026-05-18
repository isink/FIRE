// 体制内 FIRE 测算门面 —— 纯函数，无 UI/store 依赖。
// 复用现有引擎 runSim；本期不修引擎口径，结果按"粗算"对外。
// 注意：pension.yearsContributed 为已缴年限粗估（当前年龄 - 参工年龄），
// 引擎内部会再加剩余年限至 60 岁；养老金月领为粗口径，实际误差已知且有界。
// @ts-ignore - js engine
import { runSim } from '@/lib/simulation';
import { regimeByKey, CHONGQING_SOCIAL_AVG } from '@/lib/civilService';
import { _thisYear, newId } from '@/lib/utils';

const CAREER_START_AGE = 22;          // 假设 22 岁参加工作开始缴费
const RETIRE_EXPENSE_RATIO = 0.7;     // 退休月开支 ≈ 在职到手 70%
const FUND_EXPECTED_RETURN = 0.06;    // 储蓄/投资组合年化(粗口径)
const FUND_VOLATILITY = 0.12;         // 储蓄/投资组合年化波动(粗口径)
const POST_RETIRE_HORIZON = 40;       // 退休后再模拟 40 年(约至 80+ 岁)

const TZ_SEED = 1234567;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runSimSeeded(plan: any) {
  const orig = Math.random;
  Math.random = mulberry32(TZ_SEED);
  try { return runSim(plan); } finally { Math.random = orig; }
}

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
  const birthYear = _thisYear - inp.age;
  const retireYear = birthYear + inp.targetRetireAge;

  // FIX I4: compute once, reuse everywhere
  const retireExpense = Math.round(inp.monthlyNet * RETIRE_EXPENSE_RATIO);

  // FIX C1: yearsContributed = already-contributed years (engine adds remaining years to 60 itself)
  const yearsContributed = Math.max(5, inp.age - CAREER_START_AGE);

  return {
    name: '体制内粗算',
    color: '#2563eb',

    assets: [{
      id: newId(),
      type: 'fund',
      name: '储蓄/投资',
      amountCny: inp.savings,
      expectedReturn: FUND_EXPECTED_RETURN,
      volatility: FUND_VOLATILITY,
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
      // Basic 社保 pension is ALWAYS enabled — every formally employed worker has it.
      // civilOn merely changes the contributionIndex (regime vs enterprise 口径 1.0).
      enabled: true,
      yearsContributed,
      contributionIndex: civilOn ? (regimeByKey(inp.regimeKey)?.contributionIndex ?? 1.0) : 1.0,
      regimeType: inp.regimeKey,   // FIX C2: schema hygiene
      currentSocialAverage: CHONGQING_SOCIAL_AVG,
      personalAccountBalance: Math.round(inp.monthlyNet * 0.08 * 12 * yearsContributed),
      payoutMonths: 139,
    },

    // Healthcare gap is the same in both runs so it doesn't contaminate the attribution;
    // 体制内 advantage is measured purely via pension index / occupational pension / housing fund.
    healthcareGapMonthly: 400,

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

    ret: FUND_EXPECTED_RETURN,
    vol: FUND_VOLATILITY,
    infl: 0.025,
    incomeGrowth: 0.02,
    taxDrag: 0.005,
    swr: 0.035,
    withdrawalStrategy: 'fixed',
    years: Math.max(50, (retireYear - _thisYear) + POST_RETIRE_HORIZON),
    birthYear,
  };
}

export function runTizhinei(inp: TzInput): TzResult {
  // FIX I3: both runs seeded with the same fixed seed for path-fair ceteris-paribus attribution
  const real = runSimSeeded(buildPlan(inp, true));
  const naive = runSimSeeded(buildPlan(inp, false));

  // FIX I4: compute once here too
  const retireExpense = Math.round(inp.monthlyNet * RETIRE_EXPENSE_RATIO);

  const wan = (n: number) => Math.round(n / 10000);
  const delta = wan(real.finalP50 - naive.finalP50);
  const hook = delta > 0
    ? `这是粗算。同样收入和存款下，体制内（编制养老金+职业年金+公积金）比普通企业多攒约 ¥${delta} 万——这三块多数人自己算时漏了或算错。`
    : `这是粗算。按你填的，体制内三件套相对普通企业的增量有限，真正的变量在支出与退休年龄——精算版给你拆开。`;

  return {
    yearsToFire: real.yearsToFire ?? null,
    naiveYearsToFire: naive.yearsToFire ?? null,
    finalP50: real.finalP50,
    naiveFinalP50: naive.finalP50,
    retireExpenseAssumed: retireExpense,
    hook,
  };
}
