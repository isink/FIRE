// Monte Carlo simulation engine — ProjectionLab-aligned
// Inputs: plan object
// Outputs: { sampledMonths, p10, p50, p90, successRate, sustainabilityRate,
//            yearsToFire, coastFireYears, savingsRate, initial }

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
// Returns total monthly income at simulation month m (0 = simulation start)
function monthlyIncomeAt(plan, simStartYear, m) {
  const streams = plan.incomeStreams || [];

  if (streams.length === 0) {
    // Legacy: cash DCA + income growth
    const base = cashMonthlyInflow(plan);
    return base * Math.pow(1 + (plan.incomeGrowth || 0), m / 12);
  }

  const currentYear = simStartYear + m / 12;
  return streams.reduce((sum, s) => {
    const start = s.startYear != null ? s.startYear : simStartYear;
    const end   = s.endYear   != null ? s.endYear   : 9999;
    if (currentYear < start || currentYear >= end) return sum;
    const yearsActive = currentYear - start;
    return sum + (Number(s.monthlyAmount) || 0) * Math.pow(1 + (s.annualGrowth || 0), yearsActive);
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
  for (const ev of (plan.events || [])) {
    const mo = Math.round((ev.year - simStartYear) * 12);
    if (mo <= 0) continue;
    if (!map.has(mo)) map.set(mo, { lumpSum: 0, monthlyDeltaChange: 0, stopIncomeHere: false });
    const entry = map.get(mo);
    if (!ev.monthly) entry.lumpSum            += (ev.amount       || 0);
    if (ev.monthly)  entry.monthlyDeltaChange  += (ev.monthlyDelta || 0);
    if (ev.stopIncome) entry.stopIncomeHere = true;
  }
  return map;
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
    let retired        = false;
    let everReached    = false;
    let incomeActive   = true;
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
        if (ev.stopIncomeHere) incomeActive = false;
      }

      // Refresh block every BLOCK months
      if (blockPos >= BLOCK) {
        blockOffset = Math.floor(Math.random() * H);
        blockPos = 0;
      }
      const histReturn = historicalMonthlyReturns[(blockOffset + blockPos) % H];
      blockPos++;

      // Apply tax drag: scale return down
      const monthReturn = histReturn - taxDrag / 12;

      const inflMult = Math.pow(1 + infl, m / 12);
      const debtPay  = totalMonthlyDebtPayment(plan, simStartYear, m);
      let net;
      if (retired) {
        const withdrawal = withdrawStrat === 'pct'
          ? v * swr / 12
          : retExpense * inflMult;
        net = recurringDelta - withdrawal - debtPay;
      } else {
        const income = incomeActive ? monthlyIncomeAt(plan, simStartYear, m) : 0;
        net = income - baseExpense * inflMult + recurringDelta - debtPay;
      }

      v = v * (1 + monthReturn) + net;
      if (v < 0) v = 0;

      if (!retired && v >= plan.target) {
        everReached = true;
        retired = true;
      }

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
  const nomRet       = plan.ret     || 0;
  const muMonth      = (nomRet - taxDrag) / 12;
  const sigmaMonth   = plan.vol / Math.sqrt(12);

  // Real return (for Coast FIRE calculation, deterministic)
  const realRetAnnual = nomRet - taxDrag - infl;

  const baseExpense   = plan.expense || 0;
  const retExpense    = (plan.retirementExpense != null) ? plan.retirementExpense : baseExpense;
  const swr           = plan.swr || 0.04;
  const withdrawStrat = plan.withdrawalStrategy || 'fixed';

  const timeline = buildEventTimeline(plan, simStartYear);

  const sampledMonths = [];
  for (let m = 0; m <= months; m += SAMPLE_EVERY) sampledMonths.push(m);
  if (sampledMonths[sampledMonths.length - 1] !== months) sampledMonths.push(months);

  const values = sampledMonths.map(() => new Float64Array(RUNS));
  let successes        = 0;
  let sustainSuccesses = 0;

  for (let r = 0; r < RUNS; r++) {
    let v              = initial;
    let sampleIdx      = 0;
    let everReached    = false;
    let retired        = false;
    let incomeActive   = true;
    let recurringDelta = 0;

    if (sampledMonths[0] === 0) { values[0][r] = v; sampleIdx = 1; }

    for (let m = 1; m <= months; m++) {
      if (timeline.has(m)) {
        const ev = timeline.get(m);
        v += ev.lumpSum;
        recurringDelta += ev.monthlyDeltaChange;
        if (ev.stopIncomeHere) incomeActive = false;
      }

      // Inflation multiplier: expenses grow with inflation
      const inflMult = Math.pow(1 + infl, m / 12);

      const debtPay = totalMonthlyDebtPayment(plan, simStartYear, m);

      let net;
      if (retired) {
        let withdrawal;
        if (withdrawStrat === 'pct') {
          // SWR % of current portfolio
          withdrawal = v * swr / 12;
        } else {
          // Fixed dollar, inflation-adjusted so purchasing power stays constant
          withdrawal = retExpense * inflMult;
        }
        net = recurringDelta - withdrawal - debtPay;
      } else {
        const income         = incomeActive ? monthlyIncomeAt(plan, simStartYear, m) : 0;
        const expenseInflated = baseExpense * inflMult;
        net = income - expenseInflated + recurringDelta - debtPay;
      }

      const z = gaussian();
      v = v * (1 + muMonth + sigmaMonth * z) + net;
      if (v < 0) v = 0;

      if (!retired && v >= plan.target) {
        everReached = true;
        retired = true;
      }

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

  // Percentile arrays
  const p10 = [], p50 = [], p90 = [];
  for (let t = 0; t < sampledMonths.length; t++) {
    const arr = Array.from(values[t]).sort((a, b) => a - b);
    p10.push(arr[Math.floor(RUNS * 0.1)]);
    p50.push(arr[Math.floor(RUNS * 0.5)]);
    p90.push(arr[Math.floor(RUNS * 0.9)]);
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

  // Savings rate at t=0
  const income0  = currentMonthlyIncome(plan);
  const savingsRate = income0 > 0 ? Math.max(0, (income0 - baseExpense) / income0) : null;

  // Year-by-year projection rows (deterministic income + P50 portfolio)
  const yearlyRows = [];
  for (let yr = 1; yr <= plan.years; yr++) {
    const m = yr * 12;
    // Find p50 index at or just after this year-end month
    let tIdx = sampledMonths.findIndex(sm => sm >= m);
    if (tIdx < 0) tIdx = sampledMonths.length - 1;
    const portfolioP50 = Math.round(p50[tIdx]);

    // Mid-year income estimate (month halfway through the year)
    const midM = Math.round((yr - 0.5) * 12);
    const annualIncome = Math.round(monthlyIncomeAt(plan, simStartYear, midM) * 12);
    const inflMult = Math.pow(1 + infl, yr);
    const annualExpense = Math.round(baseExpense * 12 * inflMult);

    // Annual debt service for the year
    let annualDebt = 0;
    for (let k = 1; k <= 12; k++) {
      annualDebt += totalMonthlyDebtPayment(plan, simStartYear, (yr - 1) * 12 + k);
    }
    annualDebt = Math.round(annualDebt);
    const netSavings = annualIncome - annualExpense - annualDebt;

    yearlyRows.push({
      year: simStartYear + yr,
      income: annualIncome,
      expense: annualExpense,
      debt: annualDebt,
      netSavings,
      portfolioP50,
    });
  }

  return {
    initial,
    sampledMonths,
    p10, p50, p90,
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
