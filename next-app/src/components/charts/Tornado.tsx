'use client';
import { useState } from 'react';
import { usePlanStore } from '@/store/plan';
import { Button } from '@/components/ui/button';
import { chartTheme } from '@/lib/theme';
// @ts-ignore
import { runSim } from '@/lib/simulation';

export function Tornado() {
  const plan = usePlanStore(s => s.plans[s.activePlanId]);
  const [data, setData] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [ms, setMs] = useState(0);

  const run = async () => {
    if (!plan) return;
    setRunning(true);
    await new Promise(r => setTimeout(r, 30));
    const t0 = performance.now();
    const baseline = runSim(plan);
    const baseRef = baseline.yearsToFire != null ? baseline.yearsToFire : plan.years;

    const levers = [
      { label: '月支出', kind: '±20%', neg: (p: any) => { p.expense *= 0.8; }, pos: (p: any) => { p.expense *= 1.2; } },
      { label: '月收入', kind: '±20%',
        neg: (p: any) => { (p.people || []).forEach((per: any) => (per.incomeStreams || []).forEach((s: any) => s.monthlyAmount *= 0.8)); },
        pos: (p: any) => { (p.people || []).forEach((per: any) => (per.incomeStreams || []).forEach((s: any) => s.monthlyAmount *= 1.2)); } },
      { label: '资产预期收益率', kind: '±20%',
        neg: (p: any) => { (p.assets || []).forEach((a: any) => { if (a.expectedReturn != null) a.expectedReturn *= 0.8; }); p.ret *= 0.8; },
        pos: (p: any) => { (p.assets || []).forEach((a: any) => { if (a.expectedReturn != null) a.expectedReturn *= 1.2; }); p.ret *= 1.2; } },
      { label: '通胀率', kind: '±1pp',
        neg: (p: any) => { p.infl = Math.max(0, (p.infl || 0) - 0.01); }, pos: (p: any) => { p.infl = (p.infl || 0) + 0.01; } },
      { label: '初始净资产', kind: '±20%',
        neg: (p: any) => { (p.assets || []).forEach((a: any) => a.amountCny = (Number(a.amountCny) || 0) * 0.8); },
        pos: (p: any) => { (p.assets || []).forEach((a: any) => a.amountCny = (Number(a.amountCny) || 0) * 1.2); } },
      { label: '目标金额', kind: '±20%', neg: (p: any) => { p.target *= 0.8; }, pos: (p: any) => { p.target *= 1.2; } },
      { label: '波动率', kind: '±20%',
        neg: (p: any) => { (p.assets || []).forEach((a: any) => { if (a.volatility != null) a.volatility *= 0.8; }); p.vol *= 0.8; },
        pos: (p: any) => { (p.assets || []).forEach((a: any) => { if (a.volatility != null) a.volatility *= 1.2; }); p.vol *= 1.2; } },
    ];

    const out: any[] = [];
    for (const { label, kind, neg, pos } of levers) {
      const pn = JSON.parse(JSON.stringify(plan)); neg(pn);
      const pp = JSON.parse(JSON.stringify(plan)); pos(pp);
      const negY = runSim(pn).yearsToFire ?? plan.years;
      const posY = runSim(pp).yearsToFire ?? plan.years;
      out.push({ label, kind, neg: negY - baseRef, pos: posY - baseRef, abs: Math.max(Math.abs(negY - baseRef), Math.abs(posY - baseRef)) });
    }
    out.sort((a, b) => b.abs - a.abs);
    setData({ baseRef, results: out });
    setMs(Math.round(performance.now() - t0));
    setRunning(false);
  };

  const t = chartTheme();
  const maxAbs = data ? Math.max(0.1, ...data.results.map((r: any) => r.abs)) : 0.1;
  const halfW = 45;
  /* 红=盈/好 → FIRE 提前(delta<0)用 gain红; 绿=亏/坏 → FIRE 推迟用 loss绿 */
  const deltaColor = (d: number) => (d < 0 ? t.gain : t.loss);

  return (
    <div className="rounded-lg bg-surface shadow-e1 ring-1 ring-border/60 overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-sm font-semibold rounded-sm">敏感性</span>
          <span className="text-md font-semibold text-text-1 tracking-tight">哪个杠杆最能改变 FIRE 时间</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={run} disabled={running}>
            {running ? '跑 15 次模拟…' : data ? '↻ 重新分析' : '▶ 运行分析'}
          </Button>
          <span className="text-sm text-text-3 mono">
            {data ? `基线 FIRE ${data.baseRef.toFixed(1)} 年 · 耗时 ${ms} ms` : '约 2-5 秒'}
          </span>
        </div>
      </div>

      {data && (
        <div className="p-5">
          <div className="flex justify-between items-center pb-2 mb-3 border-b border-border text-sm text-text-3">
            <span className="text-gain">← FIRE 提前</span>
            <span className="font-medium text-text-2 mono">基线 {data.baseRef.toFixed(1)} 年</span>
            <span className="text-loss">FIRE 推迟 →</span>
          </div>
          <div className="space-y-2">
            {data.results.map((r: any, i: number) => {
              const negPct = (Math.abs(r.neg) / maxAbs) * halfW;
              const posPct = (Math.abs(r.pos) / maxAbs) * halfW;
              const fmtD = (d: number) => (d >= 0 ? '+' : '') + d.toFixed(1) + ' 年';
              return (
                <div key={i} className="grid grid-cols-[148px_1fr] gap-3 items-center text-sm">
                  <div>
                    <div className="font-medium text-text-1">{r.label}</div>
                    <div className="text-xs text-text-3 mono">{r.kind}</div>
                  </div>
                  <div className="flex items-center h-6 relative">
                    <div className="flex-1 flex justify-end">
                      <div className="text-white text-xs font-medium mono px-1.5 py-0.5 rounded-l-sm h-[18px] flex items-center justify-end"
                        style={{ width: `${negPct}%`, background: deltaColor(r.neg) }}>{fmtD(r.neg)}</div>
                    </div>
                    <div className="w-px h-6 bg-border-strong"></div>
                    <div className="flex-1">
                      <div className="text-white text-xs font-medium mono px-1.5 py-0.5 rounded-r-sm h-[18px] flex items-center"
                        style={{ width: `${posPct}%`, background: deltaColor(r.pos) }}>{fmtD(r.pos)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {data.results[0] && (
            <div className="mt-4 p-3 bg-surface-sunken border border-border rounded-md text-sm text-text-2">
              <strong className="text-text-1">{data.results[0].label}</strong> 是最强杠杆 — 单边变动 {data.results[0].kind} 可改变 FIRE 时间 <strong className="text-text-1 mono">{data.results[0].abs.toFixed(1)} 年</strong>。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
