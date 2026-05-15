'use client';
import { useMemo } from 'react';
import { usePlanStore } from '@/store/plan';
import { fmtCompact, _thisYear } from '@/lib/utils';
import { cn } from '@/lib/utils';
// @ts-ignore
import { planNetWorth, currentMonthlyIncome, stageMonthlyExpense } from '@/lib/simulation';

/* 数字+单位同基线: 单位用 inline span, text-3, 不另起大字号 */
function Stat({ value, unit, className }: { value: string; unit?: string; className?: string }) {
  return (
    <div className={cn('mono text-2xl font-semibold text-text-1 mt-1.5 leading-none', className)}>
      {value}
      {unit && <span className="text-md text-text-3 font-normal ml-0.5">{unit}</span>}
    </div>
  );
}

const cardBase = 'rounded-lg bg-surface shadow-e1 px-4 py-3.5 ring-1 ring-border/60';

export function HeroMetrics() {
  const plan = usePlanStore(s => s.plans[s.activePlanId]);
  const sim = usePlanStore(s => s.sim);

  const metrics = useMemo(() => {
    if (!plan) return null;
    const initial = planNetWorth(plan);
    const target = plan.target || 10000000;
    const progress = target > 0 ? Math.min(100, (initial / target) * 100) : 0;
    const income = currentMonthlyIncome(plan);
    const expense = stageMonthlyExpense(plan, 'working');
    const savingsRate = income > 0 ? Math.max(0, (income - expense) / income) : null;
    const fireDate = sim?.yearsToFire != null ? (_thisYear + Math.ceil(sim.yearsToFire)) : null;
    const coastDate = sim?.coastFireYears != null ? (_thisYear + Math.ceil(sim.coastFireYears)) : null;
    return {
      initial, target, progress, income, expense, savingsRate, fireDate, coastDate,
      yearsToFire: sim?.yearsToFire,
      coastYears: sim?.coastFireYears,
      successRate: sim?.successRate,
      sustainabilityRate: sim?.sustainabilityRate,
    };
  }, [plan, sim]);

  if (!metrics) return null;

  const label = (t: string, extra?: React.ReactNode) => (
    <div className="text-xs text-text-3 uppercase tracking-wider font-medium flex items-center gap-1.5">{t}{extra}</div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-7">
      <div className={cardBase}>
        {label('净资产')}
        <div className="mono text-2xl font-semibold text-text-1 mt-1.5 leading-none">
          {fmtCompact(metrics.initial)}
        </div>
        <div className="text-sm text-text-3 mt-1.5">目标 <span className="mono text-text-2">¥{fmtCompact(metrics.target)}</span></div>
      </div>

      <div className={cardBase}>
        {label('已达进度')}
        <Stat value={metrics.progress.toFixed(1)} unit="%" />
        <div className="mt-2.5 h-1 bg-surface-sunken rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500 ease-standard" style={{ width: `${metrics.progress}%` }}></div>
        </div>
      </div>

      {/* FIRE — 品牌红强调: 白底 + 品牌 ring + 品牌数字, 不实心填充 */}
      <div className={cn(cardBase, 'ring-primary/30 bg-primary/[0.025]')}>
        {label('FIRE 预计达成', <span className="w-1.5 h-1.5 rounded-full bg-primary" />)}
        <div className="mono text-2xl font-bold text-primary mt-1.5 leading-none">
          {metrics.fireDate ?? <span className="text-text-3 font-semibold">尚未达成</span>}
        </div>
        <div className="text-sm text-text-3 mt-1.5">
          {metrics.yearsToFire != null
            ? <><span className="mono text-text-2">{metrics.yearsToFire.toFixed(1)}</span> 年后</>
            : '当前路径终点前未触及目标'}
        </div>
      </div>

      {/* Coast — 次级强调: 中性深色 ring, 冷静 */}
      <div className={cn(cardBase, 'ring-border-strong')}>
        {label('可停投点', <span className="text-text-3 font-normal normal-case tracking-normal">Coast FIRE</span>)}
        <div className="mono text-2xl font-bold text-text-1 mt-1.5 leading-none">
          {metrics.coastDate ?? <span className="text-text-3 font-semibold">—</span>}
        </div>
        <div className="text-sm text-text-3 mt-1.5">
          {metrics.coastYears != null
            ? <><span className="mono text-text-2">{metrics.coastYears.toFixed(1)}</span> 年后可停定投</>
            : '收益未跑赢通胀 / 年数不足'}
        </div>
      </div>

      <div className={cardBase}>
        {label('达成概率')}
        <Stat value={metrics.successRate != null ? (metrics.successRate * 100).toFixed(0) : '—'} unit={metrics.successRate != null ? '%' : undefined} />
        <div className="text-sm text-text-3 mt-1.5">
          退休可持续 <span className="mono text-text-2">{metrics.sustainabilityRate != null ? (metrics.sustainabilityRate * 100).toFixed(0) + '%' : '—'}</span>
        </div>
      </div>

      <div className={cardBase}>
        {label('当前储蓄率')}
        <Stat value={metrics.savingsRate != null ? (metrics.savingsRate * 100).toFixed(0) : '—'} unit={metrics.savingsRate != null ? '%' : undefined} />
        <div className="text-sm text-text-3 mt-1.5">(收入 − 支出) / 收入</div>
      </div>
    </div>
  );
}
