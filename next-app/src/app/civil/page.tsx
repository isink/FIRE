'use client';
import { useState } from 'react';
import { NumberField } from '@/components/ui/number-field';
import { Button } from '@/components/ui/button';
import { fmtCompact } from '@/lib/utils';

/**
 * 体制内身份测算(垂直楔子原型)
 * 解析模型:体制内身份的价值 = 职业年金现值 + 养老金月差额(体制内缴费指数 vs 企业1.0)
 * 在退休期的现值;离职机会成本 = 私企更高薪资的现值 − 该身份现值。
 * 养老金口径与通用引擎 pensionForPerson 的官方计发公式一致(基础养老金部分)。
 * 不走蒙特卡洛——这是估值/决策问题,组合残值法对支出假设过敏,不稳。
 */

const _Y = new Date().getFullYear();
const INFL = 0.025;
const END_AGE = 88; // 养老金领取至预期寿命

const TYPE_PRESET: Record<string, { label: string; idx: number }> = {
  gov: { label: '公务员', idx: 1.9 },
  inst: { label: '事业编', idx: 1.6 },
  soe: { label: '央/国企', idx: 1.4 },
};

export default function CivilPage() {
  const [birthYear, setBirthYear] = useState(1995);
  const [retireYear, setRetireYear] = useState(2058);
  const [monthlyNet, setMonthlyNet] = useState(9000);
  const [socialAvg, setSocialAvg] = useState(8000);
  const [type, setType] = useState<keyof typeof TYPE_PRESET>('gov');
  const [workStartYear, setWorkStartYear] = useState(2018);
  const [occBalance, setOccBalance] = useState(120000);
  const [leavePremium, setLeavePremium] = useState(1.3);
  const [res, setRes] = useState<null | {
    identityValue: number; pvOcc: number; pvPensionDelta: number;
    opportunityCost: number; breakevenMonthly: number; ytr: number;
  }>(null);

  const run = () => {
    const idx = TYPE_PRESET[type].idx;
    const yc = Math.max(0, _Y - workStartYear);             // 已缴年限
    const ytr = Math.max(1, retireYear - _Y);               // 距退休年数
    const retireAge = retireYear - birthYear;
    const retMonths = Math.max(0, (END_AGE - retireAge)) * 12;
    const disc = Math.pow(1 + INFL, ytr);                   // 贴现到今天

    // 基础养老金(官方计发公式,与引擎 pensionForPerson 一致;个人账户两侧相同,差额里抵消)
    const saAtRetire = socialAvg * Math.pow(1 + INFL, ytr);
    const yearsTotal = yc + ytr;
    const basic = (i: number) => saAtRetire * (1 + i) / 2 * yearsTotal * 0.01;
    const dPensionMonthly = basic(idx) - basic(1.0);        // 体制内 vs 企业 月差额(退休时名义)

    // 职业年金账户滚到退休(记账利率约 4%),贴现回今天
    const occLump = occBalance * Math.pow(1.04, ytr);
    const pvOcc = occLump / disc;
    // 养老金差额:退休后随通胀指数化、再按通胀贴现 ≈ 实际持平,故 PV ≈ 月差额×领取月数 ÷ 贴现
    const pvPensionDelta = (dPensionMonthly * retMonths) / disc;
    const identityValue = pvOcc + pvPensionDelta;

    // 私企更高薪资的现值差(体制内 2% 稳定增长,两侧同增长率,只差倍数)
    const salPV = (mult: number) => {
      let s = 0;
      for (let y = 0; y < ytr; y++) s += monthlyNet * mult * 12 * Math.pow(1.02, y) / Math.pow(1 + INFL, y);
      return s;
    };
    const dSalaryPV = salPV(leavePremium) - salPV(1.0);
    const opportunityCost = identityValue - dSalaryPV;      // >0 留更值;<0 走更值(纯财务)
    // 离开打平所需的私企月薪(财务上)
    const base1 = salPV(1.0);
    const breakevenMonthly = base1 > 0 ? monthlyNet * (1 + identityValue / base1) : 0;

    setRes({ identityValue, pvOcc, pvPensionDelta, opportunityCost, breakevenMonthly, ytr });
  };

  const identityValue = res ? res.identityValue : 0;
  const opportunityCost = res ? res.opportunityCost : 0;

  return (
    <div className="min-h-screen bg-canvas text-text-1">
      <div className="max-w-3xl mx-auto px-5 py-14">
        <div className="mb-2 text-sm text-primary font-medium">体制内 · 身份测算</div>
        <h1 className="text-2xl font-medium tracking-tight">你的体制内身份,到底值多少钱?</h1>
        <p className="mt-3 text-base text-text-2 leading-relaxed">
          把养老金 + 职业年金 + 稳定性折成今天的钱,并算清&ldquo;现在离职&rdquo;放弃了多少。
          通用 FIRE 工具答不了这个问题——这就是为你这类家庭做的。
        </p>

        {/* 输入 */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-4">
          <Field label="出生年份"><NumberField value={birthYear} onCommit={setBirthYear} /></Field>
          <Field label="计划退休年"><NumberField value={retireYear} onCommit={setRetireYear} /></Field>
          <Field label="参加工作年份"><NumberField value={workStartYear} onCommit={setWorkStartYear} /></Field>
          <Field label="编制类型">
            <select value={type} onChange={e => setType(e.target.value as any)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text-1">
              {Object.entries(TYPE_PRESET).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="当前到手月薪 ¥"><NumberField value={monthlyNet} onCommit={setMonthlyNet} /></Field>
          <Field label="当地社平 ¥/月"><NumberField value={socialAvg} onCommit={setSocialAvg} /></Field>
          <Field label="职业年金账户 ¥"><NumberField value={occBalance} onCommit={setOccBalance} /></Field>
          <Field label="离职后薪资倍数"><NumberField value={leavePremium} format={v => String(v)} parse={s => Number(s) || 1} onCommit={setLeavePremium} /></Field>
        </div>

        <Button variant="primary" size="lg" className="mt-7" onClick={run}>
          ▶ 测算我的体制内身份现值
        </Button>

        {/* 输出:首屏只露这一个 */}
        {res && (
          <div className="mt-9 rounded-lg border border-border bg-surface p-6">
            <div className="text-sm text-text-2">体制内身份净现值（与同薪私企相比,折算到今天的钱）</div>
            <div className="mt-1.5 mono text-[2.4rem] leading-none font-medium text-primary">
              ¥{fmtCompact(identityValue)}
            </div>
            <div className="mt-2 text-sm text-text-3">
              = 职业年金现值 ¥{fmtCompact(res.pvOcc)} + 养老金差额现值 ¥{fmtCompact(res.pvPensionDelta)}
              <span className="mx-1.5 text-border-strong">·</span>距退休 {res.ytr} 年
            </div>

            <div className="mt-6 pt-5 border-t border-border">
              <div className="text-sm text-text-2">按你设的离职后薪资 ×{leavePremium},现在离职的纯财务机会成本</div>
              <div className={'mt-1.5 mono text-2xl font-medium ' + (opportunityCost >= 0 ? 'text-gain' : 'text-loss')}>
                {opportunityCost >= 0
                  ? `留下更值 +¥${fmtCompact(opportunityCost)}`
                  : `离开更值 +¥${fmtCompact(Math.abs(opportunityCost))}`}
              </div>
              <div className="mt-1.5 text-sm text-text-3">
                {opportunityCost >= 0
                  ? `私企要把到手月薪开到约 ¥${fmtCompact(res.breakevenMonthly)} 以上,离开才在财务上划算`
                  : '按此薪资,离开体制在纯财务上更优——但未计编制稳定性/抗失业的隐性价值'}
              </div>
            </div>

            <p className="mt-6 text-xs text-text-3 leading-relaxed">
              口径:身份现值 = 职业年金账户(按 4% 滚到退休)+ 基础养老金月差额(体制内缴费指数 vs 企业 1.0,官方计发公式,与本站引擎一致)在退休期({END_AGE} 岁止)的现值,通胀 2.5% 贴现到今天。视同缴费/过渡性养老金未计 = 偏保守、低估体制内。仅供决策参考,非精算结论。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1 text-sm text-text-2">{label}</span>
      {children}
    </label>
  );
}
