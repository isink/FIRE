'use client';
import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { usePlanStore } from '@/store/plan';
import { fmtCompact, _thisYear } from '@/lib/utils';
import { chartTheme } from '@/lib/theme';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const PANEL = 'rounded-lg bg-surface shadow-e1 ring-1 ring-border/60 p-5';

export function WithdrawChart() {
 const sim = usePlanStore(s => s.sim);

 const data = useMemo(() => {
 if (!sim || !sim.annualDrawCashP50) return null;
 const t = chartTheme();
 const labels: number[] = [];
 const cashData: number[] = [];
 const taxData: number[] = [];
 const ipaData: number[] = [];
 for (let yr = 0; yr < sim.annualDrawCashP50.length; yr++) {
 const c = sim.annualDrawCashP50[yr] || 0;
 const tx = sim.annualDrawTaxP50[yr] || 0;
 const p = sim.annualDrawIpaP50[yr] || 0;
 if (c + tx + p < 100) continue;
 labels.push(_thisYear + yr + 1);
 cashData.push(Math.round(c));
 taxData.push(Math.round(tx));
 ipaData.push(Math.round(p));
 }
 if (labels.length === 0) return null;
 return {
 labels,
 datasets: [
 { label: '现金桶', data: cashData, backgroundColor: t.bucket[0], borderRadius: 2 },
 { label: '应税权益', data: taxData, backgroundColor: t.bucket[1], borderRadius: 2 },
 { label: 'IPA', data: ipaData, backgroundColor: t.bucket[2], borderRadius: 2 },
 ],
 };
 }, [sim]);

 const theme = useMemo(() => chartTheme(), [sim]);

 if (!data) return null;

 return (
 <div className={PANEL}>
 <div className="text-md font-medium text-text-1 mb-4 tracking-tight">退休期取款来源</div>
 <div className="h-[240px]">
 <Bar
 data={data as any}
 options={{
 responsive: true,
 maintainAspectRatio: false,
 plugins: {
 legend: { position: 'top', align: 'end', labels: { font: { size: 11 }, color: theme.tick, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } },
 tooltip: {
 mode: 'index', intersect: false,
 backgroundColor: theme.tooltipBg, titleColor: theme.tooltipFg, bodyColor: theme.tooltipFg,
 padding: 10, cornerRadius: 6, titleFont: { size: 11 }, bodyFont: { size: 11 },
 callbacks: {
 label: (ctx: any) => `${ctx.dataset.label}: ¥${fmtCompact(ctx.parsed.y)}`,
 footer: (items: any[]) => '合计: ¥' + fmtCompact(items.reduce((s, i) => s + i.parsed.y, 0)),
 },
 },
 },
 scales: {
 x: { stacked: true, ticks: { color: theme.axis, font: { size: 10 } }, grid: { display: false }, border: { display: false } },
 y: { stacked: true, ticks: { color: theme.axis, font: { size: 10 }, callback: (v: any) => '¥' + fmtCompact(v) }, grid: { color: theme.grid }, border: { display: false } },
 },
 }}
 />
 </div>
 </div>
 );
}
