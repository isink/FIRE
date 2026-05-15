'use client';
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { usePlanStore } from '@/store/plan';
import { fmtCompact, _thisYear } from '@/lib/utils';
import { chartTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const PANEL = 'rounded-lg bg-surface shadow-e1 ring-1 ring-border/60 p-5';

export function MainChart() {
  const sim = usePlanStore(s => s.sim);
  const plan = usePlanStore(s => s.plans[s.activePlanId]);
  const chartStyle = usePlanStore(s => s.chartStyle);
  const setChartStyle = usePlanStore(s => s.setChartStyle);

  const data = useMemo(() => {
    if (!sim || !plan) return null;
    const t = chartTheme();
    const labels = sim.sampledMonths.map((m: number) => String(_thisYear + Math.floor(m / 12)));
    if (chartStyle === 'stack') {
      const mk = (label: string, arr: any, idx: number) => ({
        label,
        data: arr || [],
        backgroundColor: t.bucketFill[idx],
        borderColor: t.bucket[idx],
        borderWidth: 1,
        fill: true,
        pointRadius: 0,
        tension: 0.2,
      });
      return {
        labels,
        datasets: [
          mk('现金', sim.p50Cash, 0),
          mk('应税权益', sim.p50Taxable, 1),
          mk('IPA', sim.p50Ipa, 2),
          mk('房产', sim.p50Property || sim.p50.map(() => 0), 3),
          {
            label: '目标',
            data: sim.sampledMonths.map(() => plan.target),
            borderColor: t.target,
            borderDash: [5, 4],
            borderWidth: 1.5,
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
          },
        ],
      };
    }
    return {
      labels,
      datasets: [
        { label: 'P90', data: sim.p90, borderColor: 'transparent', backgroundColor: t.band, fill: '+1', pointRadius: 0, tension: 0.15 },
        { label: 'P10', data: sim.p10, borderColor: 'transparent', backgroundColor: t.band, fill: false, pointRadius: 0, tension: 0.15 },
        { label: 'P50', data: sim.p50, borderColor: t.p50, backgroundColor: 'transparent', borderWidth: 2, fill: false, pointRadius: 0, tension: 0.2 },
        {
          label: '目标',
          data: sim.sampledMonths.map(() => plan.target),
          borderColor: t.target,
          borderDash: [5, 4],
          borderWidth: 1.5,
          backgroundColor: 'transparent',
          fill: false,
          pointRadius: 0,
        },
      ],
    };
  }, [sim, plan, chartStyle]);

  const theme = useMemo(() => chartTheme(), [sim]);

  if (!data) return null;

  return (
    <div className={PANEL}>
      <div className="flex justify-between items-center mb-4">
        <div className="text-md font-semibold text-text-1 tracking-tight">
          净资产模拟
          <span className="ml-2 text-sm font-normal text-text-3">
            {chartStyle === 'stack' ? '桶分层 P50' : 'P10 / P50 / P90 带'}
          </span>
        </div>
        <div className="inline-flex gap-1 p-0.5 bg-surface-sunken rounded-md">
          {(['stack', 'line'] as const).map(s => (
            <button
              key={s}
              onClick={() => setChartStyle(s)}
              className={cn(
                'px-3 py-1 text-sm rounded-sm transition-all duration-fast ease-standard',
                chartStyle === s ? 'bg-surface text-text-1 shadow-e1 font-medium' : 'text-text-3 hover:text-text-2'
              )}
            >
              {s === 'stack' ? '堆叠' : '线条'}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[320px]">
        <Line
          data={data as any}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 200 },
            plugins: {
              legend: {
                display: chartStyle === 'stack',
                position: 'bottom',
                labels: { font: { size: 11 }, color: theme.tick, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' },
              },
              tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: theme.tooltipBg,
                titleColor: theme.tooltipFg,
                bodyColor: theme.tooltipFg,
                padding: 10,
                cornerRadius: 6,
                titleFont: { size: 11 },
                bodyFont: { size: 11 },
                callbacks: { label: (item: any) => `${item.dataset.label}: ¥${fmtCompact(item.parsed.y)}` },
              },
            },
            scales: {
              x: { grid: { color: theme.grid }, ticks: { color: theme.axis, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 16 }, border: { display: false } },
              y: {
                stacked: chartStyle === 'stack',
                grid: { color: theme.grid },
                border: { display: false },
                ticks: { color: theme.axis, font: { size: 10 }, callback: (v: any) => '¥' + fmtCompact(v) },
              },
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
          }}
        />
      </div>
    </div>
  );
}
