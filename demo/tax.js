/* ============================================================
   tax.js — 中国个税与五险一金引擎
   ------------------------------------------------------------
   说明：
   - 综合所得：工资薪金 / 劳务报酬 / 稿酬 / 特许权使用费
     采用 7 级超额累进税率（3% – 45%）按年度计算
   - 月度采用"年化方法"近似（年税 / 12），不模拟逐月累计预扣
   - 五险一金按各城市标准基数上下限近似，个人部分扣除
   - 专项附加扣除支持：房贷利息 / 租房 / 子女教育 / 婴幼儿照护 /
     赡养老人 / 继续教育 / 大病医疗
   - 公司缴纳部分（工伤/生育等）不计入个人扣除
   ============================================================ */

// ── 五险一金个人缴纳比例 + 缴费基数上下限（按城市近似 2024 数据）──
// monthlyMin / monthlyMax: 缴费基数上下限（单位：元 / 月）
// pension / medical / unemployment / housingFund: 个人部分缴费比例
// 工伤 + 生育全部由公司缴纳，个人不缴
const CITY_PRESETS = {
  shanghai: {
    label: '上海',
    socialBase:  { min: 7310,  max: 36549 },
    housingBase: { min: 2690,  max: 36549 },
    pension: 0.08, medical: 0.02, unemployment: 0.005,
    housingFundRate: 0.07,  // 上海公积金常见 7%
  },
  beijing: {
    label: '北京',
    socialBase:  { min: 6326,  max: 35283 },
    housingBase: { min: 2420,  max: 35283 },
    pension: 0.08, medical: 0.02, unemployment: 0.005,
    housingFundRate: 0.12,
  },
  shenzhen: {
    label: '深圳',
    socialBase:  { min: 2360,  max: 28122 },
    housingBase: { min: 2360,  max: 35283 },
    pension: 0.08, medical: 0.02, unemployment: 0.003,
    housingFundRate: 0.05,
  },
  hangzhou: {
    label: '杭州',
    socialBase:  { min: 4812,  max: 24930 },
    housingBase: { min: 2280,  max: 36675 },
    pension: 0.08, medical: 0.02, unemployment: 0.005,
    housingFundRate: 0.12,
  },
  guangzhou: {
    label: '广州',
    socialBase:  { min: 4492,  max: 22463 },
    housingBase: { min: 1900,  max: 36072 },
    pension: 0.08, medical: 0.02, unemployment: 0.002,
    housingFundRate: 0.05,
  },
  custom: {
    label: '自定义',
    // 当 city='custom' 时使用 plan.taxConfig.customRates
  },
};

// ── 综合所得 7 级超额累进（年度税率表）──
// upTo: 应纳税所得额上限；rate: 边际税率；quickDeduct: 速算扣除数
const TAX_BRACKETS_ANNUAL = [
  { upTo: 36000,    rate: 0.03, quickDeduct: 0 },
  { upTo: 144000,   rate: 0.10, quickDeduct: 2520 },
  { upTo: 300000,   rate: 0.20, quickDeduct: 16920 },
  { upTo: 420000,   rate: 0.25, quickDeduct: 31920 },
  { upTo: 660000,   rate: 0.30, quickDeduct: 52920 },
  { upTo: 960000,   rate: 0.35, quickDeduct: 85920 },
  { upTo: Infinity, rate: 0.45, quickDeduct: 181920 },
];

// 基本减除费用：5000 元 / 月，60000 元 / 年
const BASIC_DEDUCTION_MONTHLY = 5000;

// 专项附加扣除标准额度（元 / 月，2024 标准）
const DEDUCTION_LIMITS = {
  rent:            { '一线': 1500, '二线': 1100, '三线': 800 },  // 租房
  mortgage:        1000,   // 房贷利息（首套，最长 240 个月）
  kidsEducation:   2000,   // 子女教育（每个子女）
  infant:          2000,   // 3 岁以下婴幼儿照护
  parentsCare: {           // 赡养老人
    onlyChild:      3000,
    notOnlyChild:   1500,  // 兄弟姐妹分摊，最高 1500
  },
  education: {             // 继续教育
    academic:       400,   // 学历继续教育（最长 48 个月）
    professional:   3600 / 12, // 职业资格 3600 / 年 ≈ 300 / 月（年内一次性）
  },
  // 大病医疗按年度上限 80000，超过 15000 部分可扣，仅在汇算清缴时
  // 这里暂以月均近似（年度上限 / 12）
  illness:         80000 / 12,
};

const TAX_DEFAULTS = {
  city: 'shanghai',
  customRates: null,
  specialDeductions: {
    rent:           0,   // 月度元数
    mortgage:       0,
    kidsEducation:  0,
    infant:         0,
    parentsCare:    0,
    education:      0,
    illness:        0,
  },
};

// ── 计算函数 ──────────────────────────────────────────────

/**
 * 计算单月五险一金（个人缴纳部分）
 * @param {number} grossMonthly 税前月薪
 * @param {object} taxConfig    plan.taxConfig
 * @returns {object} { pension, medical, unemployment, housingFund, total }
 */
function calcSocialInsurance(grossMonthly, taxConfig) {
  const cityKey = taxConfig?.city || 'shanghai';
  const preset  = (cityKey === 'custom' && taxConfig.customRates)
    ? taxConfig.customRates
    : CITY_PRESETS[cityKey] || CITY_PRESETS.shanghai;

  const socialBase  = preset.socialBase  || { min: 0, max: Infinity };
  const housingBase = preset.housingBase || socialBase;

  // 缴费基数 = 工资被上下限夹住
  const sBase = Math.max(socialBase.min,  Math.min(socialBase.max,  grossMonthly));
  const hBase = Math.max(housingBase.min, Math.min(housingBase.max, grossMonthly));

  const pension       = sBase * (preset.pension       ?? 0.08);
  const medical       = sBase * (preset.medical       ?? 0.02);
  const unemployment  = sBase * (preset.unemployment  ?? 0.005);
  const housingFund   = hBase * (preset.housingFundRate ?? 0.07);

  return {
    pension, medical, unemployment, housingFund,
    total: pension + medical + unemployment + housingFund,
  };
}

/**
 * 计算月度专项附加扣除总额（基于 taxConfig.specialDeductions 直接求和）
 */
function calcSpecialDeductionsMonthly(taxConfig) {
  const d = taxConfig?.specialDeductions || {};
  return (Number(d.rent)          || 0)
       + (Number(d.mortgage)      || 0)
       + (Number(d.kidsEducation) || 0)
       + (Number(d.infant)        || 0)
       + (Number(d.parentsCare)   || 0)
       + (Number(d.education)     || 0)
       + (Number(d.illness)       || 0);
}

/**
 * 按年化方法计算单月个税
 * @param {number} grossMonthly       税前月薪
 * @param {number} socialInsMonthly   月度五险一金
 * @param {number} specialDedMonthly  月度专项附加扣除
 * @returns {{ taxMonthly: number, marginalRate: number, effectiveRate: number }}
 */
function calcMonthlyTax(grossMonthly, socialInsMonthly, specialDedMonthly) {
  // 月度应纳税所得额
  const taxableMonthly = Math.max(
    0,
    grossMonthly - socialInsMonthly - BASIC_DEDUCTION_MONTHLY - specialDedMonthly
  );
  // 年化进入累进表
  const taxableAnnual = taxableMonthly * 12;

  let bracket = TAX_BRACKETS_ANNUAL[0];
  for (const b of TAX_BRACKETS_ANNUAL) {
    if (taxableAnnual <= b.upTo) { bracket = b; break; }
  }
  const taxAnnual  = Math.max(0, taxableAnnual * bracket.rate - bracket.quickDeduct);
  const taxMonthly = taxAnnual / 12;

  return {
    taxMonthly,
    marginalRate:  bracket.rate,
    effectiveRate: grossMonthly > 0 ? taxMonthly / grossMonthly : 0,
  };
}

/**
 * 主入口：税前月薪 → 完整工资单
 * @returns {{
 *   gross, socialIns, tax, net,
 *   socialInsBreakdown, marginalRate, effectiveRate, specialDed
 * }}
 */
function grossToNet(grossMonthly, taxConfig) {
  grossMonthly = Number(grossMonthly) || 0;
  if (grossMonthly <= 0) {
    return { gross: 0, socialIns: 0, tax: 0, net: 0,
             socialInsBreakdown: null, marginalRate: 0, effectiveRate: 0, specialDed: 0 };
  }
  const si = calcSocialInsurance(grossMonthly, taxConfig);
  const sd = calcSpecialDeductionsMonthly(taxConfig);
  const t  = calcMonthlyTax(grossMonthly, si.total, sd);
  return {
    gross:              grossMonthly,
    socialIns:          si.total,
    socialInsBreakdown: si,
    tax:                t.taxMonthly,
    net:                grossMonthly - si.total - t.taxMonthly,
    specialDed:         sd,
    marginalRate:       t.marginalRate,
    effectiveRate:      t.effectiveRate,
  };
}

/**
 * 给定一条收入流，返回当下"实发月收入"
 * - stream.type === 'gross' → 走税务引擎
 * - 其它（默认 net）         → 直接返回 monthlyAmount
 */
function streamNetMonthly(stream, taxConfig) {
  const amt = Number(stream.monthlyAmount) || 0;
  if (stream.type !== 'gross') return amt;
  return grossToNet(amt, taxConfig).net;
}

// 暴露到全局（项目目前无模块系统，HTML 直接通过 <script> 引入）
window.TAX = {
  CITY_PRESETS,
  TAX_BRACKETS_ANNUAL,
  DEDUCTION_LIMITS,
  TAX_DEFAULTS,
  BASIC_DEDUCTION_MONTHLY,
  calcSocialInsurance,
  calcSpecialDeductionsMonthly,
  calcMonthlyTax,
  grossToNet,
  streamNetMonthly,
};
