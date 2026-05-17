// Monte Carlo simulation engine — ProjectionLab-aligned
// Inputs: plan object
// Outputs: { sampledMonths, p10, p50, p90, successRate, sustainabilityRate,
//            yearsToFire, coastFireYears, savingsRate, initial }

import { grossToNet } from './tax';

const RUNS = 5000;
const SAMPLE_EVERY = 3;

function gaussian() {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function computeAssetValue(a) {
  return Number(a.amountCny) || 0;
}

function planNetWorth(plan) {
  return plan.assets.reduce((s, a) => s + computeAssetValue(a), 0);
}

// ── Asset category return / volatility defaults (年化, A股口径) ──
const ASSET_CATEGORY_DEFAULTS = {
  cash:     { ret: 0.020, vol: 0.005, bucket: 'cash'     }, // 余额宝 / 银行理财
  fund:     { ret: 0.080, vol: 0.160, bucket: 'taxable'  }, // 公募基金（混合）
  stock:    { ret: 0.090, vol: 0.180, bucket: 'taxable'  }, // A股 / ETF
  hkstock:  { ret: 0.070, vol: 0.200, bucket: 'taxable'  },
  usstock:  { ret: 0.100, vol: 0.160, bucket: 'taxable'  },
  gold:     { ret: 0.060, vol: 0.150, bucket: 'taxable'  },
  crypto:   { ret: 0.300, vol: 0.800, bucket: 'taxable'  },
  ipa:      { ret: 0.050, vol: 0.100, bucket: 'ipa'      }, // 个人养老金（60 岁前锁定）
  property: { ret: 0.030, vol: 0.060, bucket: 'property' }, // 房产升值（一线城市保守口径）
};

// 60 岁前不可取的个人养老金锁定年龄
const IPA_UNLOCK_AGE = 60;

function assetExpectedReturn(asset, plan) {
  if (asset && asset.expectedReturn != null) return asset.expectedReturn;
  const def = ASSET_CATEGORY_DEFAULTS[asset?.type];
  if (def) return def.ret;
  return plan?.ret || 0.07;
}

function assetVolatility(asset, plan) {
  if (asset && asset.volatility != null) return asset.volatility;
  const def = ASSET_CATEGORY_DEFAULTS[asset?.type];
  if (def) return def.vol;
  return plan?.vol || 0.15;
}

function assetBucket(asset) {
  return ASSET_CATEGORY_DEFAULTS[asset?.type]?.bucket || 'taxable';
}

// 组合加权预期收益（用于 Coast FIRE 计算）
function portfolioExpectedReturn(plan) {
  const total = (plan.assets || []).reduce((s, a) => s + (Number(a.amountCny) || 0), 0);
  if (total <= 0) return plan.ret || 0.07;
  return (plan.assets || []).reduce((s, a) => {
    const w = (Number(a.amountCny) || 0) / total;
    return s + w * assetExpectedReturn(a, plan);
  }, 0);
}

// ── Withdrawal order: 现金 → 应税 → IPA (>=60 岁) ──
// 第 5 个参数 recorder（可选）：{cash, taxable, ipa} 用于累加各桶被取走的额度
function drainFromBuckets(perAsset, plan, need, age, recorder) {
  if (need <= 0) return 0;
  let remaining = need;
  let dCash = 0, dTax = 0, dIpa = 0;

  // Pool 1: cash buckets
  for (let i = 0; i < plan.assets.length && remaining > 0; i++) {
    if (assetBucket(plan.assets[i]) !== 'cash') continue;
    const take = Math.min(remaining, perAsset[i]);
    perAsset[i] -= take;
    remaining   -= take;
    dCash       += take;
  }

  // Pool 2: taxable (按现值比例分摊)
  if (remaining > 0) {
    const idxs = [];
    let bucketTotal = 0;
    for (let i = 0; i < plan.assets.length; i++) {
      if (assetBucket(plan.assets[i]) === 'taxable') {
        idxs.push(i);
        bucketTotal += perAsset[i];
      }
    }
    if (bucketTotal > 0) {
      const take = Math.min(remaining, bucketTotal);
      const scale = take / bucketTotal;
      for (const i of idxs) perAsset[i] -= perAsset[i] * scale;
      remaining -= take;
      dTax      += take;
    }
  }

  // Pool 3: IPA (仅在 60 岁后解锁)
  if (remaining > 0 && age >= IPA_UNLOCK_AGE) {
    for (let i = 0; i < plan.assets.length && remaining > 0; i++) {
      if (assetBucket(plan.assets[i]) !== 'ipa') continue;
      const take = Math.min(remaining, perAsset[i]);
      perAsset[i] -= take;
      remaining   -= take;
      dIpa        += take;
    }
  }

  if (recorder) {
    recorder.cash    += dCash;
    recorder.taxable += dTax;
    recorder.ipa     += dIpa;
  }
  return remaining;
}

// Glide path 再平衡：把超出 target 权益占比的部分从应税桶迁入现金桶
// 不强制升仓（防止迫使用户加大风险）。返回是否触发了迁移。
function rebalanceTaxableToCash(perAsset, plan, targetEquityShare) {
  let totCash = 0, totTax = 0;
  for (let i = 0; i < plan.assets.length; i++) {
    const b = assetBucket(plan.assets[i]);
    if      (b === 'cash')    totCash += perAsset[i];
    else if (b === 'taxable') totTax  += perAsset[i];
  }
  const totLiquid = totCash + totTax;
  if (totLiquid <= 0) return false;
  const currentEquityShare = totTax / totLiquid;
  if (currentEquityShare <= targetEquityShare) return false;
  const excess = (currentEquityShare - targetEquityShare) * totLiquid;

  // 从 taxable 桶按比例抽出 excess，存入第一个 cash 桶
  const idxs = [];
  for (let i = 0; i < plan.assets.length; i++) {
    if (assetBucket(plan.assets[i]) === 'taxable') idxs.push(i);
  }
  if (totTax > 0) {
    const scale = excess / totTax;
    for (const i of idxs) perAsset[i] -= perAsset[i] * scale;
  }
  // 注入 cash 桶
  for (let i = 0; i < plan.assets.length; i++) {
    if (assetBucket(plan.assets[i]) === 'cash') { perAsset[i] += excess; break; }
  }
  return true;
}

// 把正现金流注入 cash 桶（默认到第一个 cash 资产；若无 cash 资产，注入第一个 taxable 桶）
function depositCash(perAsset, plan, amount) {
  if (amount <= 0) return;
  let cashIdx = -1;
  for (let i = 0; i < plan.assets.length; i++) {
    if (assetBucket(plan.assets[i]) === 'cash') { cashIdx = i; break; }
  }
  if (cashIdx < 0) {
    // 无现金桶，存入第一个 taxable 资产
    for (let i = 0; i < plan.assets.length; i++) {
      if (assetBucket(plan.assets[i]) === 'taxable') { cashIdx = i; break; }
    }
  }
  if (cashIdx >= 0) perAsset[cashIdx] += amount;
}

// 家庭层"代表年龄"：取所有人中年龄最大者（用于 IPA 60 岁解锁判断 — 任一人到点即解锁）
function userAgeAtMonth(plan, simStartYear, m) {
  const t = m / 12;
  if (plan.people && plan.people.length > 0) {
    const maxAge = Math.max(...plan.people.map(p => (simStartYear - (p.birthYear || simStartYear - 30)) + t));
    return maxAge;
  }
  const birth = plan.birthYear || (simStartYear - 30);
  return (simStartYear - birth) + t;
}

// 社保养老金月度发放额（在 sim 内每月计算，便于动态通胀适配）
// 基础养老金 = 退休时社平 × (1 + 缴费指数) / 2 × 总缴费年限 × 1%
// 个人账户养老金 = 退休时余额 / 计发月数
// 仅在 age >= 60 时发放（中国法定退休年龄简化为 60）
const PENSION_START_AGE = 60;

// 单人养老金月发放（基础+个人账户，60 岁触发）
function pensionForPerson(birthYear, cfg, planInfl, simStartYear, m) {
  if (!cfg || !cfg.enabled) return 0;
  const age = (simStartYear + m / 12) - (birthYear || simStartYear - 30);
  if (age < PENSION_START_AGE) return 0;
  const yearsUntilRetire = Math.max(0, PENSION_START_AGE - (simStartYear - (birthYear || simStartYear - 30)));
  const sa0 = Number(cfg.currentSocialAverage) || 11000;
  const saAtRetire = sa0 * Math.pow(1 + planInfl, yearsUntilRetire);
  const yearsTotal = (Number(cfg.yearsContributed) || 0) + yearsUntilRetire;
  const idx = Number(cfg.contributionIndex) || 1.0;
  const basic = saAtRetire * (1 + idx) / 2 * yearsTotal * 0.01;
  const personal = (Number(cfg.personalAccountBalance) || 0) / Math.max(60, Number(cfg.payoutMonths) || 139);
  const monthsPostRetire = Math.max(0, (age - PENSION_START_AGE) * 12);
  return (basic + personal) * Math.pow(1 + planInfl, monthsPostRetire / 12);
}

function pensionMonthlyBenefit(plan, simStartYear, m) {
  const inflRate = plan.infl || 0.025;
  // V15+：按人迭代（每人自带 pension cfg；若无 person.pension，退回家庭层 plan.pension）
  if (plan.people && plan.people.length > 0) {
    let total = 0;
    for (const person of plan.people) {
      const cfg = person.pension || plan.pension;
      total += pensionForPerson(person.birthYear, cfg, inflRate, simStartYear, m);
    }
    return total;
  }
  return pensionForPerson(plan.birthYear, plan.pension, inflRate, simStartYear, m);
}

// 退休后医疗自付缺口（按月，固定通胀按 plan.infl 与医疗通胀复合）
function healthcareGapAtMonth(plan, simStartYear, m) {
  const gap = Number(plan.healthcareGapMonthly) || 0;
  if (gap <= 0) return 0;
  const stage = stageAt(plan, simStartYear, m);
  if (stage !== 'retired') return 0;
  // 医疗通胀按 plan.infl + 3pp 默认（与 expense category 默认对齐）
  const medInfl = (plan.infl || 0.025) + 0.03;
  return gap * Math.pow(1 + medInfl, m / 12);
}

// 房产每月净现金流（自住 = -物业费；出租 = +租金 - 物业费）。返回总流量（可正可负）。
function totalPropertyCashFlow(plan) {
  let flow = 0;
  for (const a of (plan.assets || [])) {
    if (a.type !== 'property') continue;
    const maint = Number(a.monthlyMaintenance) || 0;
    const rent  = (a.propertyMode === 'rental') ? (Number(a.monthlyRent) || 0) : 0;
    flow += rent - maint;
  }
  return flow;
}

// 公积金参数(读 plan.housingFund)。冲房贷时抵月供、超出部分按结息率累积、还清后释放;
// 不冲贷时缴存直接计入净储蓄、初始余额退休时释放。
function housingFundParams(plan) {
  const hf = plan.housingFund || {};
  return {
    on: !!hf.enabled,
    contrib: Number(hf.monthlyContribution) || 0,
    balance0: Number(hf.balance) || 0,
    creditRate: hf.creditRate != null ? Number(hf.creditRate) : 0.015,
    offset: hf.offsetMortgage !== false, // 默认冲房贷(体制内典型)
  };
}

// 职业年金参数(读 plan.occupationalPension)。退休前按记账利率累积+缴存,
// 退休按计发月数发放(monthly)或一次性入桶(lump)。缴存属单位+个人专户,不计入在职现金流。
function occupationalPensionParams(plan) {
  const op = plan.occupationalPension || {};
  return {
    on: !!op.enabled,
    balance0: Number(op.balance) || 0,
    contrib: Number(op.monthlyContribution) || 0,
    creditRate: op.creditRate != null ? Number(op.creditRate) : 0.04,
    payout: op.payout === 'lump' ? 'lump' : 'monthly',
    payMonths: Math.max(60, Number(plan.pension?.payoutMonths) || 139),
  };
}

// ── DCA helpers (used for display, not primary simulation income) ──
const CALENDAR_DAYS_PER_MONTH = 365 / 12;

function assetMonthlyContrib(a) {
  const amt = Number(a.dcaAmount) || 0;
  const freq = a.dcaFreq || 'month';
  if (freq === 'day')  return amt * CALENDAR_DAYS_PER_MONTH;
  if (freq === 'week') return amt * (52 / 12);
  return amt;
}

// Legacy cash DCA as income (used when no incomeStreams defined)
function cashMonthlyInflow(plan) {
  return (plan.assets || [])
    .filter(a => a.type === 'cash')
    .reduce((s, a) => s + assetMonthlyContrib(a), 0);
}

function investMonthlyTotal(plan) {
  return (plan.assets || [])
    .filter(a => a.type !== 'cash')
    .reduce((s, a) => s + assetMonthlyContrib(a), 0);
}

// ── Income streams ──
// Returns total monthly income at simulation month m, aggregating across all people.
// 每人在其 retireYear 之后停止贡献收入（人员独立退休时间）。
function monthlyIncomeAt(plan, simStartYear, m) {
  const currentYear = simStartYear + m / 12;
  const taxConfig   = plan.taxConfig;

  // 路径 A：使用 plan.people（V15+）
  if (plan.people && plan.people.length > 0) {
    let total = 0;
    for (const person of plan.people) {
      const retireY = person.retireYear || 9999;
      if (currentYear >= retireY) continue;  // 该人已退休
      for (const s of (person.incomeStreams || [])) {
        const start = s.startYear != null ? s.startYear : simStartYear;
        const end   = s.endYear   != null ? s.endYear   : 9999;
        if (currentYear < start || currentYear >= end) continue;
        const yearsActive = currentYear - start;
        // freq='year': 输入的是年额(如年终奖10万),按月引擎用月均等价值,
        // 与"每年一笔"在 30+ 年复利下差异可忽略;用户只需填年额、选「年」。
        const baseAmt = (Number(s.monthlyAmount) || 0) / (s.freq === 'year' ? 12 : 1);
        const grown = baseAmt * Math.pow(1 + (s.annualGrowth || 0), yearsActive);
        if (s.type === 'gross' && taxConfig) {
          total += grossToNet(grown, taxConfig).net;
        } else {
          total += grown;
        }
      }
    }
    return total;
  }

  // 路径 B：旧 plan（无 people，直接读 incomeStreams）
  const streams = plan.incomeStreams || [];
  if (streams.length === 0) {
    const base = cashMonthlyInflow(plan);
    return base * Math.pow(1 + (plan.incomeGrowth || 0), m / 12);
  }
  return streams.reduce((sum, s) => {
    const start = s.startYear != null ? s.startYear : simStartYear;
    const end   = s.endYear   != null ? s.endYear   : 9999;
    if (currentYear < start || currentYear >= end) return sum;
    const yearsActive = currentYear - start;
    const baseAmt = (Number(s.monthlyAmount) || 0) / (s.freq === 'year' ? 12 : 1);
    const grown = baseAmt * Math.pow(1 + (s.annualGrowth || 0), yearsActive);
    if (s.type === 'gross' && taxConfig) {
      return sum + grossToNet(grown, taxConfig).net;
    }
    return sum + grown;
  }, 0);
}

// Total income at t=0, for display & savings-rate calculation
function currentMonthlyIncome(plan) {
  return monthlyIncomeAt(plan, new Date().getFullYear(), 0);
}

// ── Debt / Mortgage ──
// Returns the monthly payment for a single liability at simulation month m.
// loan: { principal, rate (annual decimal), years, paymentType, startYear }
function liabilityMonthlyPayment(loan, simStartYear, m) {
  const startMonth   = Math.round((loan.startYear - simStartYear) * 12);
  const monthsInLoan = m - startMonth;
  const totalMonths  = (loan.years || 0) * 12;
  if (monthsInLoan < 1 || monthsInLoan > totalMonths) return 0;

  const r = (loan.rate || 0) / 12;
  const P = loan.principal || 0;
  if (P <= 0 || totalMonths <= 0) return 0;

  if (loan.paymentType === 'equal-principal') {
    // 等额本金: 每月本金 = P/n; 每月利息 = 剩余本金 × r
    const monthlyPrincipal = P / totalMonths;
    const remaining        = P - monthlyPrincipal * (monthsInLoan - 1);
    return monthlyPrincipal + remaining * r;
  }
  // 等额本息: M = P * r * (1+r)^n / ((1+r)^n - 1)
  if (r === 0) return P / totalMonths;
  const factor = Math.pow(1 + r, totalMonths);
  return P * r * factor / (factor - 1);
}

function totalMonthlyDebtPayment(plan, simStartYear, m) {
  return (plan.liabilities || []).reduce(
    (sum, loan) => sum + liabilityMonthlyPayment(loan, simStartYear, m), 0
  );
}

// Computes current debt totals (balance, monthly payment, payoff year) per liability at m=0.
function summarizeLiabilities(plan) {
  const simStartYear = new Date().getFullYear();
  return (plan.liabilities || []).map(loan => {
    const r            = (loan.rate || 0) / 12;
    const P            = loan.principal || 0;
    const totalMonths  = (loan.years || 0) * 12;
    const startMonth   = Math.round((loan.startYear - simStartYear) * 12);
    const monthsSoFar  = Math.max(0, -startMonth);  // already paid if startYear < now
    const monthsLeft   = Math.max(0, totalMonths - monthsSoFar);
    const payoffMonth  = startMonth + totalMonths;
    const payoffYear   = simStartYear + payoffMonth / 12;
    const monthlyPay   = liabilityMonthlyPayment(loan, simStartYear, Math.max(1, startMonth + 1));

    // Remaining balance (only meaningful for 等额本息; approximate for 等额本金)
    let balance = P;
    if (monthsSoFar > 0 && totalMonths > 0) {
      if (loan.paymentType === 'equal-principal') {
        balance = Math.max(0, P - (P / totalMonths) * monthsSoFar);
      } else {
        // 等额本息: balance = M * ((1+r)^remaining - 1) / (r*(1+r)^remaining)
        if (r === 0) {
          balance = P * (1 - monthsSoFar / totalMonths);
        } else {
          const factorRem = Math.pow(1 + r, monthsLeft);
          balance = monthlyPay * (factorRem - 1) / (r * factorRem);
        }
      }
    }
    return {
      id: loan.id,
      name: loan.name,
      monthlyPayment: monthlyPay,
      balance,
      monthsLeft,
      payoffYear,
    };
  });
}

// ── Event timeline ──
function buildEventTimeline(plan, simStartYear) {
  const map = new Map();
  const touch = (mo) => {
    if (!map.has(mo)) map.set(mo, { lumpSum: 0, monthlyDeltaChange: 0 });
    return map.get(mo);
  };
  for (const ev of (plan.events || [])) {
    const mo = Math.round((ev.year - simStartYear) * 12);
    if (mo <= 0) continue;
    const entry = touch(mo);
    if (!ev.monthly) entry.lumpSum            += (ev.amount       || 0);
    if (ev.monthly)  entry.monthlyDeltaChange  += (ev.monthlyDelta || 0);
    // stopIncome events are now superseded by plan.stages.retired.startYear (silently ignored)
  }
  // Goals act as one-shot withdrawals at goal.year (amount is positive in the data model)
  for (const g of (plan.goals || [])) {
    if (g.disabled) continue;
    const mo = Math.round((g.year - simStartYear) * 12);
    if (mo <= 0) continue;
    touch(mo).lumpSum -= (Number(g.amount) || 0);
  }
  return map;
}

// ── Life stages ──
// Returns one of 'working' | 'transition' | 'retired' for given month m.
// 家庭层退休时刻：所有人均已退休（= max of people[].retireYear）。
function householdRetireYear(plan) {
  if (plan.people && plan.people.length > 0) {
    return Math.max(...plan.people.map(p => p.retireYear || 9999));
  }
  return plan.stages?.retired?.startYear || 9999;
}
function stageAt(plan, simStartYear, m) {
  const stages = plan.stages;
  if (!stages) return 'working';
  const year = simStartYear + m / 12;
  const retY = householdRetireYear(plan);
  if (retY != null && year >= retY) return 'retired';
  const tran = stages.transition;
  if (tran?.enabled && tran.startYear != null && year >= tran.startYear) return 'transition';
  return 'working';
}

// Monthly expense for a given stage; falls back to plan-level defaults.
// 与分类无关的版本，仅返回"月支出当前值"。Sim 内部按月通胀时另有 stageMonthlyExpenseAt(plan, stage, m, simStartYear)。
function stageMonthlyExpense(plan, stageName) {
  const baseExpense = plan.expense || 0;
  const retExpense  = (plan.retirementExpense != null) ? plan.retirementExpense : baseExpense;
  const st = plan.stages?.[stageName];
  const override = st?.monthlyExpense;
  if (override != null) return override;
  return stageName === 'retired' ? retExpense : baseExpense;
}

// 按月计算支出（带分类通胀 + 阶段覆盖）。
// - 如果 stage 有 monthlyExpense 覆盖 → 用该值乘 plan.infl
// - 否则若有 expenseCategories → 按类别独立通胀求和
// - 否则用 plan.expense × plan.infl
function stageMonthlyExpenseAt(plan, stageName, m) {
  const yrs = m / 12;
  const st = plan.stages?.[stageName];
  const override = st?.monthlyExpense;
  const planInfl = plan.infl || 0;

  if (override != null) {
    return override * Math.pow(1 + planInfl, yrs);
  }
  const cats = plan.expenseCategories;
  if (cats && cats.length > 0 && stageName !== 'retired') {
    // 退休阶段如果没设 override，回退到 retirementExpense（保留旧语义）
    let sum = 0;
    for (const c of cats) {
      const rate = (c.inflationRate != null) ? c.inflationRate : planInfl;
      sum += (Number(c.monthly) || 0) * Math.pow(1 + rate, yrs);
    }
    return sum;
  }
  // 兜底（旧 plan / 退休 stage 无 override）
  const baseExpense = plan.expense || 0;
  const retExpense  = (plan.retirementExpense != null) ? plan.retirementExpense : baseExpense;
  const baseNow = stageName === 'retired' ? retExpense : baseExpense;
  return baseNow * Math.pow(1 + planInfl, yrs);
}

// 0 = no income (retired), 1 = full income, 0..1 = partial (半退休/Gap Year)
function stageIncomeMultiplier(plan, stageName) {
  if (stageName === 'retired') return 0;
  if (stageName === 'transition') {
    const m = plan.stages?.transition?.incomeMultiplier;
    return (m == null ? 1 : m);
  }
  return 1;
}

// ── Historical backtesting simulation ──
// historicalMonthlyReturns: array of actual monthly returns (decimals) from a market index.
// Uses block bootstrap (block size 12) to preserve serial correlation, then runs the same
// cashflow logic as runSim but replaces the Gaussian draw with a sampled historical return.
function runHistoricalSim(plan, historicalMonthlyReturns) {
  if (!historicalMonthlyReturns || historicalMonthlyReturns.length < 12) return null;

  const simStartYear = new Date().getFullYear();
  const initial      = planNetWorth(plan);
  const months       = plan.years * 12;
  const taxDrag      = plan.taxDrag  || 0;
  const infl         = plan.infl     || 0;
  const baseExpense  = plan.expense  || 0;
  const retExpense   = (plan.retirementExpense != null) ? plan.retirementExpense : baseExpense;
  const swr          = plan.swr      || 0.04;
  const withdrawStrat= plan.withdrawalStrategy || 'fixed';
  const timeline     = buildEventTimeline(plan, simStartYear);
  const BLOCK        = 12; // 12-month block bootstrap preserves seasonal patterns
  const H            = historicalMonthlyReturns.length;

  const sampledMonths = [];
  for (let m = 0; m <= months; m += SAMPLE_EVERY) sampledMonths.push(m);
  if (sampledMonths[sampledMonths.length - 1] !== months) sampledMonths.push(months);

  const values = sampledMonths.map(() => new Float64Array(RUNS));
  let successes = 0;
  let sustainSuccesses = 0;

  for (let r = 0; r < RUNS; r++) {
    let v              = initial;
    let sampleIdx      = 0;
    let everReached    = false;
    let recurringDelta = 0;

    // Block bootstrap: pick a random start in the historical series for each block
    let blockOffset = Math.floor(Math.random() * H);
    let blockPos    = 0;

    if (sampledMonths[0] === 0) { values[0][r] = v; sampleIdx = 1; }

    for (let m = 1; m <= months; m++) {
      if (timeline.has(m)) {
        const ev = timeline.get(m);
        v += ev.lumpSum;
        recurringDelta += ev.monthlyDeltaChange;
      }

      // Refresh block every BLOCK months
      if (blockPos >= BLOCK) {
        blockOffset = Math.floor(Math.random() * H);
        blockPos = 0;
      }
      const histReturn = historicalMonthlyReturns[(blockOffset + blockPos) % H];
      blockPos++;

      const monthReturn = histReturn - taxDrag / 12;
      const inflMult    = Math.pow(1 + infl, m / 12);
      const debtPay     = totalMonthlyDebtPayment(plan, simStartYear, m);

      const stage       = stageAt(plan, simStartYear, m);
      const stageExp    = stageMonthlyExpense(plan, stage);
      const incomeMult  = stageIncomeMultiplier(plan, stage);

      let net;
      if (stage === 'retired') {
        const withdrawal = withdrawStrat === 'pct'
          ? v * swr / 12
          : stageExp * inflMult;
        net = recurringDelta - withdrawal - debtPay;
      } else {
        const income = monthlyIncomeAt(plan, simStartYear, m) * incomeMult;
        net = income - stageExp * inflMult + recurringDelta - debtPay;
      }

      v = v * (1 + monthReturn) + net;
      if (v < 0) v = 0;

      if (!everReached && v >= plan.target) everReached = true;

      if (sampleIdx < sampledMonths.length && m === sampledMonths[sampleIdx]) {
        values[sampleIdx][r] = v;
        sampleIdx++;
      }
    }

    if (everReached) {
      successes++;
      if (v > 0) sustainSuccesses++;
    }
  }

  const hp10 = [], hp50 = [], hp90 = [];
  for (let t = 0; t < sampledMonths.length; t++) {
    const arr = Array.from(values[t]).sort((a, b) => a - b);
    hp10.push(arr[Math.floor(RUNS * 0.1)]);
    hp50.push(arr[Math.floor(RUNS * 0.5)]);
    hp90.push(arr[Math.floor(RUNS * 0.9)]);
  }

  // Historical FIRE date: P50 first crosses target
  let yearsToFire = null;
  for (let t = 0; t < hp50.length; t++) {
    if (hp50[t] >= plan.target) {
      yearsToFire = sampledMonths[t] / 12;
      break;
    }
  }

  return {
    hp10, hp50, hp90,
    successRate: successes / RUNS,
    sustainabilityRate: successes > 0 ? sustainSuccesses / successes : 0,
    yearsToFire,
    sampledMonths,
  };
}

// ── Main simulation ──
function runSim(plan) {
  const simStartYear = new Date().getFullYear();
  const initial      = planNetWorth(plan);
  const months       = plan.years * 12;
  const taxDrag      = plan.taxDrag || 0;
  const infl         = plan.infl    || 0;
  const swr          = plan.swr || 0.04;
  const withdrawStrat= plan.withdrawalStrategy || 'fixed';

  // 加权预期收益用于 Coast FIRE 的确定性计算
  const realRetAnnual = portfolioExpectedReturn(plan) - taxDrag - infl;

  // 预计算每个资产的 μ_month, σ_month（避免在主循环里重复查表）
  const assets    = plan.assets || [];
  const N         = assets.length;
  const muMonths   = new Float64Array(N);
  const sigMonths  = new Float64Array(N);
  const initVals   = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = assets[i];
    muMonths[i]  = (assetExpectedReturn(a, plan) - taxDrag) / 12;
    sigMonths[i] = assetVolatility(a, plan) / Math.sqrt(12);
    initVals[i]  = Number(a.amountCny) || 0;
  }

  const timeline = buildEventTimeline(plan, simStartYear);
  const HF = housingFundParams(plan);
  const OP = occupationalPensionParams(plan);

  const sampledMonths = [];
  for (let m = 0; m <= months; m += SAMPLE_EVERY) sampledMonths.push(m);
  if (sampledMonths[sampledMonths.length - 1] !== months) sampledMonths.push(months);

  const values = sampledMonths.map(() => new Float64Array(RUNS));
  // 按桶记录每个 sample 月的快照，用于堆叠面积图（取 P50 那条 run 的 bucket 分解）
  const bCash = sampledMonths.map(() => new Float64Array(RUNS));
  const bTax  = sampledMonths.map(() => new Float64Array(RUNS));
  const bIpa  = sampledMonths.map(() => new Float64Array(RUNS));
  const bProp = sampledMonths.map(() => new Float64Array(RUNS));

  // 预计算每个资产的桶归属（避免主循环里反复查表）
  // 0=cash, 1=taxable, 2=ipa, 3=property
  const bucketOf = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const b = assetBucket(assets[i]);
    bucketOf[i] = b === 'cash' ? 0 : b === 'ipa' ? 2 : b === 'property' ? 3 : 1;
  }

  let successes        = 0;
  let sustainSuccesses = 0;

  // 退休阶段每年从各桶取出的累计额（按 run × year 存储）
  const yearsCount = plan.years || 30;
  const drawCash = new Float64Array(RUNS * yearsCount);
  const drawTax  = new Float64Array(RUNS * yearsCount);
  const drawIpa  = new Float64Array(RUNS * yearsCount);

  // 复用一个 perAsset 缓冲区（每个 run 重置）
  const perAsset = new Float64Array(N);

  // 把当前 perAsset 拍照到 sample 桶数组
  const snapshot = (t, r) => {
    let c = 0, x = 0, p = 0, pr = 0;
    for (let i = 0; i < N; i++) {
      const v = perAsset[i];
      const b = bucketOf[i];
      if      (b === 0) c  += v;
      else if (b === 2) p  += v;
      else if (b === 3) pr += v;
      else              x  += v;
    }
    bCash[t][r] = c; bTax[t][r] = x; bIpa[t][r] = p; bProp[t][r] = pr;
  };

  for (let r = 0; r < RUNS; r++) {
    // Reset
    for (let i = 0; i < N; i++) perAsset[i] = initVals[i];
    let v              = initial;
    let sampleIdx      = 0;
    let everReached    = false;
    let recurringDelta = 0;
    let hfBal = HF.on ? HF.balance0 : 0;   // 公积金账户余额(本 run)
    let hfReleased = false;
    let opBal = OP.on ? OP.balance0 : 0;   // 职业年金账户余额(本 run)
    let opStarted = false;                 // 退休时已结转
    let opMonthlyBenefit = 0, opPayLeft = 0;
    // Guyton-Klinger state（仅在 retired 模式启用时使用）
    let gkAnnual    = null;
    let gkInitRate  = swr;
    let gkPortfolioAtYearStart = 0;
    let gkMonthsSinceRetire    = 0;

    if (sampledMonths[0] === 0) { values[0][r] = v; snapshot(0, r); sampleIdx = 1; }

    // 当年取款累计（每月累加，年初重置）
    const yearRec = { cash: 0, taxable: 0, ipa: 0 };

    for (let m = 1; m <= months; m++) {
      const yearIdx = Math.floor((m - 1) / 12);  // 0..yearsCount-1

      // —— 1) 事件 & 目标的一次性现金流 ——
      if (timeline.has(m)) {
        const ev = timeline.get(m);
        if (ev.lumpSum > 0) {
          depositCash(perAsset, plan, ev.lumpSum);
        } else if (ev.lumpSum < 0) {
          drainFromBuckets(perAsset, plan, -ev.lumpSum,
                            userAgeAtMonth(plan, simStartYear, m), yearRec);
        }
        recurringDelta += ev.monthlyDeltaChange;
      }

      const debtPay      = totalMonthlyDebtPayment(plan, simStartYear, m);
      const stage        = stageAt(plan, simStartYear, m);
      const expenseNow   = stageMonthlyExpenseAt(plan, stage, m);  // 已含通胀（分类或全局）
      const incomeMult   = stageIncomeMultiplier(plan, stage);
      const ageNow       = userAgeAtMonth(plan, simStartYear, m);

      // —— 2) 现金流：在职/过渡期 = 收入-支出-债务+持续事件 → 注入或抽取
      //                退休 = 取款需求 = 月支出 + 债务 - 持续事件 → 全部从桶里抽
      // 房产净现金流：自住 -物业费，出租 +租金-物业费；与工作/退休阶段无关
      const propFlow    = totalPropertyCashFlow(plan);
      const pensionFlow = pensionMonthlyBenefit(plan, simStartYear, m);  // 仅 60 岁后 > 0
      const medGap      = healthcareGapAtMonth(plan, simStartYear, m);   // 仅退休阶段 > 0

      // —— 公积金月度净效应 ——
      let hfNet = 0;
      if (HF.on) {
        if (HF.offset) {
          if (debtPay > 0) {
            const covered = Math.min(HF.contrib, debtPay);
            hfNet += covered;                       // 公积金替还的月供(抵消下方 −debtPay)
            const surplus = HF.contrib - covered;
            if (surplus > 0) hfBal += surplus;
            hfBal *= (1 + HF.creditRate / 12);
          } else {
            if (!hfReleased) { hfNet += hfBal; hfBal = 0; hfReleased = true; }  // 还清后账户一次性释放
            hfNet += HF.contrib;                    // 此后缴存全额转可投资
          }
        } else {
          hfNet += HF.contrib;                      // 不冲贷:缴存直接进净储蓄
          if (!hfReleased && stage === 'retired') { hfNet += hfBal; hfBal = 0; hfReleased = true; }
        }
      }

      // —— 职业年金月度净效应 ——
      let opNet = 0;
      if (OP.on) {
        if (stage !== 'retired') {
          opBal = opBal * (1 + OP.creditRate / 12) + OP.contrib;  // 专户累积,不动现金流
        } else {
          if (!opStarted) {
            opStarted = true;
            if (OP.payout === 'lump') { opNet += opBal; opBal = 0; }
            else { opMonthlyBenefit = OP.payMonths > 0 ? opBal / OP.payMonths : 0; opPayLeft = OP.payMonths; opBal = 0; }
          }
          if (OP.payout === 'monthly' && opPayLeft > 0) { opNet += opMonthlyBenefit; opPayLeft--; }
        }
      }

      let net;
      if (stage === 'retired') {
        const totalNow = (() => { let s = 0; for (let i = 0; i < N; i++) s += perAsset[i]; return s; })();
        let withdrawal;
        if (withdrawStrat === 'pct') {
          withdrawal = totalNow * swr / 12;
        } else if (withdrawStrat === 'gk') {
          // 第一次进入 retired：初始化 GK 状态
          if (gkAnnual == null) {
            gkAnnual = Math.max(1, totalNow) * swr;
            gkInitRate = swr;
            gkPortfolioAtYearStart = totalNow;
            gkMonthsSinceRetire = 0;
          }
          gkMonthsSinceRetire++;
          // 年度边界：应用 GK 三条规则
          if (gkMonthsSinceRetire > 1 && gkMonthsSinceRetire % 12 === 1) {
            const lastYrReturn = gkPortfolioAtYearStart > 0
              ? (totalNow - gkPortfolioAtYearStart) / gkPortfolioAtYearStart
              : 0;
            const curRate = totalNow > 0 ? gkAnnual / totalNow : 0;
            // Capital preservation: 当前提取率 > 初始 × 1.2 → 砍 10%
            if (curRate > gkInitRate * 1.2)      gkAnnual *= 0.9;
            // Prosperity: 当前提取率 < 初始 × 0.8 → 涨 10%
            else if (curRate < gkInitRate * 0.8) gkAnnual *= 1.1;
            // Inflation rule: 上一年负回报 → 跳过通胀
            if (lastYrReturn >= 0)               gkAnnual *= (1 + infl);
            gkPortfolioAtYearStart = totalNow;
          }
          withdrawal = gkAnnual / 12;
        } else {
          withdrawal = expenseNow;
        }
        net = recurringDelta - withdrawal - debtPay + propFlow + pensionFlow - medGap + hfNet + opNet;
      } else {
        const income = monthlyIncomeAt(plan, simStartYear, m) * incomeMult;
        net = income - expenseNow + recurringDelta - debtPay + propFlow + pensionFlow - medGap + hfNet + opNet;
      }
      if (net > 0) depositCash(perAsset, plan, net);
      else if (net < 0) drainFromBuckets(perAsset, plan, -net, ageNow, yearRec);

      // —— 3) 每个资产独立的随机演化 ——
      let totalV = 0;
      for (let i = 0; i < N; i++) {
        const z = gaussian();
        perAsset[i] *= (1 + muMonths[i] + sigMonths[i] * z);
        if (perAsset[i] < 0) perAsset[i] = 0;
        totalV += perAsset[i];
      }
      v = totalV;

      if (!everReached && v >= plan.target) everReached = true;

      if (sampleIdx < sampledMonths.length && m === sampledMonths[sampleIdx]) {
        values[sampleIdx][r] = v;
        snapshot(sampleIdx, r);
        sampleIdx++;
      }

      // 年末：把当年累计提款写入 per-run 数组并重置 + 触发 glide path 再平衡
      if (m % 12 === 0 && yearIdx < yearsCount) {
        const k = r * yearsCount + yearIdx;
        drawCash[k] = yearRec.cash;
        drawTax[k]  = yearRec.taxable;
        drawIpa[k]  = yearRec.ipa;
        yearRec.cash = yearRec.taxable = yearRec.ipa = 0;

        if (plan.glidePath && plan.glidePath.enabled) {
          const age = userAgeAtMonth(plan, simStartYear, m);
          const floor = (Number(plan.glidePath.equityFloorPct) || 30) / 100;
          const targetShare = Math.max(floor, Math.min(0.95, (110 - age) / 100));
          rebalanceTaxableToCash(perAsset, plan, targetShare);
        }
      }
    }

    if (everReached) {
      successes++;
      if (v > 0) sustainSuccesses++;
    }
  }

  // 每年 P50 取款额（每桶独立 median；不要求三桶之和 = total median，但作为分布展示合适）
  const annualDrawCashP50 = new Array(yearsCount);
  const annualDrawTaxP50  = new Array(yearsCount);
  const annualDrawIpaP50  = new Array(yearsCount);
  const tmp = new Array(RUNS);
  for (let yr = 0; yr < yearsCount; yr++) {
    for (let k = 0; k < RUNS; k++) tmp[k] = drawCash[k * yearsCount + yr];
    tmp.sort((a, b) => a - b);
    annualDrawCashP50[yr] = tmp[Math.floor(RUNS * 0.5)];
    for (let k = 0; k < RUNS; k++) tmp[k] = drawTax[k * yearsCount + yr];
    tmp.sort((a, b) => a - b);
    annualDrawTaxP50[yr]  = tmp[Math.floor(RUNS * 0.5)];
    for (let k = 0; k < RUNS; k++) tmp[k] = drawIpa[k * yearsCount + yr];
    tmp.sort((a, b) => a - b);
    annualDrawIpaP50[yr]  = tmp[Math.floor(RUNS * 0.5)];
  }

  // Percentile arrays + bucket P50 path（拿 P50 那条 run 的 bucket 分解，保证堆叠之和 = P50 total）
  const p10 = [], p50 = [], p90 = [];
  const p50Cash = [], p50Taxable = [], p50Ipa = [], p50Property = [];
  for (let t = 0; t < sampledMonths.length; t++) {
    const idxs = new Array(RUNS);
    for (let k = 0; k < RUNS; k++) idxs[k] = k;
    idxs.sort((a, b) => values[t][a] - values[t][b]);
    const i10 = idxs[Math.floor(RUNS * 0.1)];
    const i50 = idxs[Math.floor(RUNS * 0.5)];
    const i90 = idxs[Math.floor(RUNS * 0.9)];
    p10.push(values[t][i10]);
    p50.push(values[t][i50]);
    p90.push(values[t][i90]);
    p50Cash.push(bCash[t][i50]);
    p50Taxable.push(bTax[t][i50]);
    p50Ipa.push(bIpa[t][i50]);
    p50Property.push(bProp[t][i50]);
  }

  // FIRE date: P50 first crosses target
  let yearsToFire = null;
  for (let t = 0; t < p50.length; t++) {
    if (p50[t] >= plan.target) {
      yearsToFire = sampledMonths[t] / 12;
      break;
    }
  }

  // Coast FIRE: earliest month where P50 would reach target with NO further contributions
  // coastTarget_at_t = plan.target / (1 + realReturn)^(remainingYears)
  let coastFireYears = null;
  if (realRetAnnual > 0) {
    for (let t = 0; t < p50.length; t++) {
      const remainingYrs = (months - sampledMonths[t]) / 12;
      const coastTarget  = plan.target / Math.pow(1 + realRetAnnual, remainingYrs);
      if (p50[t] >= coastTarget) {
        coastFireYears = sampledMonths[t] / 12;
        break;
      }
    }
  }

  // Savings rate at t=0（用全局默认月支出口径）
  const income0  = currentMonthlyIncome(plan);
  const baseExp0 = stageMonthlyExpense(plan, 'working');
  const savingsRate = income0 > 0 ? Math.max(0, (income0 - baseExp0) / income0) : null;

  // Year-by-year projection rows (deterministic income + P50 portfolio)
  const yearlyRows = [];
  for (let yr = 1; yr <= plan.years; yr++) {
    const m = yr * 12;
    // Find p50 index at or just after this year-end month
    let tIdx = sampledMonths.findIndex(sm => sm >= m);
    if (tIdx < 0) tIdx = sampledMonths.length - 1;
    const portfolioP50 = Math.round(p50[tIdx]);

    // Mid-year stage-aware figures (income multiplier + stage-specific expense with category inflation)
    const midM       = Math.round((yr - 0.5) * 12);
    const midStage   = stageAt(plan, simStartYear, midM);
    const incomeMult = stageIncomeMultiplier(plan, midStage);
    const annualIncome  = Math.round(monthlyIncomeAt(plan, simStartYear, midM) * 12 * incomeMult);
    const annualExpense = Math.round(stageMonthlyExpenseAt(plan, midStage, midM) * 12);

    // Annual debt service for the year
    let annualDebt = 0;
    for (let k = 1; k <= 12; k++) {
      annualDebt += totalMonthlyDebtPayment(plan, simStartYear, (yr - 1) * 12 + k);
    }
    annualDebt = Math.round(annualDebt);

    // 与 Monte-Carlo 同口径：把 recurring 事件 / 养老金 / 房产 / 医疗缺口 计入，
    // 否则"年支出/年净储蓄"会系统性遗漏养娃(-6000)、公积金转投(+6000)等持续事件。
    let recur = 0;
    for (const ev of (plan.events || [])) {
      if (ev.monthly && ev.year <= (simStartYear + yr)) recur += (Number(ev.monthlyDelta) || 0);
    }
    const propFlowM    = totalPropertyCashFlow(plan);
    const pensionFlowM  = pensionMonthlyBenefit(plan, simStartYear, midM);
    const medGapM      = healthcareGapAtMonth(plan, simStartYear, midM);
    const baseExpM     = stageMonthlyExpenseAt(plan, midStage, midM);
    const debtM        = annualDebt / 12;
    // 公积金稳态月效应(展示口径,不含一次性释放——与蒙卡同向,略保守)
    const _hf = housingFundParams(plan);
    const hfM = _hf.on ? (debtM > 0 ? Math.min(_hf.contrib, debtM) : _hf.contrib) : 0;
    // 职业年金:退休后稳态月发(展示近似;一次性领的不在逐年体现,与公积金一致略保守)
    const _op = occupationalPensionParams(plan);
    let opM = 0;
    if (_op.on && midStage === 'retired' && _op.payout === 'monthly') {
      const ytr = Math.max(0, householdRetireYear(plan) - simStartYear);
      const occAtRetire = _op.balance0 * Math.pow(1 + _op.creditRate, ytr) + _op.contrib * 12 * ytr * Math.pow(1 + _op.creditRate, ytr / 2);
      opM = occAtRetire / _op.payMonths;
    }

    let monthlyNet;
    if (midStage === 'retired') {
      monthlyNet = recur - baseExpM - debtM + propFlowM + pensionFlowM - medGapM + hfM + opM;
    } else {
      monthlyNet = (annualIncome / 12) - baseExpM + recur - debtM + propFlowM + pensionFlowM - medGapM + hfM + opM;
    }
    const netSavings = Math.round(monthlyNet * 12);
    // 展示口径：支出列吸收所有真实流出，保持 收入 − 支出 − 偿债 = 净储蓄 自洽
    const effExpense = Math.round(annualIncome - netSavings - annualDebt);

    yearlyRows.push({
      year: simStartYear + yr,
      income: annualIncome,
      expense: effExpense,
      debt: annualDebt,
      netSavings,
      portfolioP50,
    });
  }

  return {
    initial,
    sampledMonths,
    p10, p50, p90,
    p50Cash, p50Taxable, p50Ipa, p50Property,   // bucket breakdown along the P50 path
    annualDrawCashP50, annualDrawTaxP50, annualDrawIpaP50,  // 退休期年度提取桶分解（每桶独立 median）
    finalP10: p10[p10.length - 1],
    finalP50: p50[p50.length - 1],
    finalP90: p90[p90.length - 1],
    yearsToFire,
    coastFireYears,
    savingsRate,
    successRate:        successes / RUNS,
    sustainabilityRate: successes > 0 ? sustainSuccesses / successes : 0,
    yearlyRows,
  };
}

// ESM exports
export {
  RUNS, SAMPLE_EVERY,
  gaussian, computeAssetValue, planNetWorth,
  ASSET_CATEGORY_DEFAULTS, IPA_UNLOCK_AGE,
  assetExpectedReturn, assetVolatility, assetBucket, portfolioExpectedReturn,
  drainFromBuckets, rebalanceTaxableToCash, depositCash,
  userAgeAtMonth,
  PENSION_START_AGE, pensionForPerson, pensionMonthlyBenefit, healthcareGapAtMonth,
  totalPropertyCashFlow,
  assetMonthlyContrib, cashMonthlyInflow, investMonthlyTotal,
  monthlyIncomeAt, currentMonthlyIncome,
  liabilityMonthlyPayment, totalMonthlyDebtPayment, summarizeLiabilities,
  buildEventTimeline,
  householdRetireYear, stageAt, stageMonthlyExpense, stageMonthlyExpenseAt, stageIncomeMultiplier,
  runHistoricalSim, runSim,
};
