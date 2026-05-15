'use client';
import { useMemo, useRef, useEffect, useState } from 'react';
import { usePlanStore } from '@/store/plan';
import { fmt, fmtCompact } from '@/lib/utils';
import { chartTheme } from '@/lib/theme';
// @ts-ignore
import { grossToNet } from '@/lib/tax';

const PANEL = 'rounded-lg bg-surface shadow-e1 ring-1 ring-border/60 p-5';

export function Sankey() {
  const plan = usePlanStore(s => s.plans[s.activePlanId]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(Math.max(640, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    if (!plan) return null;
    let gross = 0, socialIns = 0, tax = 0, net = 0;
    const people = plan.people || [];
    for (const person of people) {
      for (const s of (person.incomeStreams || [])) {
        const amt = Number(s.monthlyAmount) || 0;
        if (s.type === 'gross') {
          const r = grossToNet(amt, plan.taxConfig);
          gross += r.gross; socialIns += r.socialIns; tax += r.tax; net += r.net;
        } else {
          gross += amt; net += amt;
        }
      }
    }
    const cats = (plan.expenseCategories || []).filter((c: any) => (Number(c.monthly) || 0) > 0);
    const totalExp = cats.reduce((s: number, c: any) => s + (Number(c.monthly) || 0), 0);
    const savings = Math.max(0, net - totalExp);
    const right: any[] = [];
    if (socialIns > 0) right.push({ name: '五险一金', amount: socialIns, group: 'tax' });
    if (tax > 0) right.push({ name: '个税', amount: tax, group: 'tax' });
    cats.forEach((c: any) => right.push({ name: c.name, amount: Number(c.monthly) || 0, group: 'expense' }));
    right.push({ name: '净储蓄', amount: savings, group: 'savings' });
    return { gross, net, socialIns, tax, totalExp, savings, right };
  }, [plan]);

  if (!data || data.gross <= 0) {
    return (
      <div className={PANEL}>
        <div className="text-md font-semibold text-text-1 mb-2 tracking-tight">月度现金流桑基</div>
        <div className="text-center text-base text-text-3 py-10">尚无收入数据 — 在「收入」标签添加月薪后查看</div>
      </div>
    );
  }

  const t = chartTheme();
  const W = width;
  const H = Math.max(280, Math.min(420, 36 * Math.max(3, data.right.length)));
  const PAD = 24;
  const NODE_W = 12;
  const LEFT_X = 100;
  const RIGHT_X = W - 200;
  const innerH = H - PAD * 2;

  /* 单色 slate 阶梯: 支出按序渐变, 税固定 slate, 净储蓄 = gain(红=盈) */
  const expenseRamp = [t.bucket[1], t.bucket[3], t.bucket[0], t.bucket[2]];
  let expenseIdx = 0;
  const nodes = data.right.map(n => {
    let color: string;
    if (n.group === 'expense') { color = expenseRamp[expenseIdx % expenseRamp.length]; expenseIdx++; }
    else if (n.group === 'tax') color = t.axis;
    else if (n.group === 'savings') color = t.gain;
    else color = t.bucket[1];
    return { ...n, color };
  });

  const totalGapPx = Math.max(0, (nodes.length - 1) * 2);
  const rightYScale = (innerH - totalGapPx) / data.gross;
  let rY = PAD;
  nodes.forEach((n: any) => {
    n.rightY = rY;
    n.rightH = n.amount * rightYScale;
    rY = rY + n.rightH + 2;
  });

  let leftY = PAD;
  const leftH = innerH;
  const leftYScale = innerH / data.gross;

  const paths: any[] = [];
  const labels: any[] = [];
  nodes.forEach((n: any, i: number) => {
    const lh = n.amount * leftYScale;
    const x1 = LEFT_X + NODE_W;
    const x2 = RIGHT_X;
    const midX = (x1 + x2) / 2;
    const y1a = leftY, y1b = leftY + lh;
    const y2a = n.rightY, y2b = n.rightY + n.rightH;
    paths.push(
      <path key={'flow' + i}
        d={`M ${x1} ${y1a} C ${midX} ${y1a}, ${midX} ${y2a}, ${x2} ${y2a} L ${x2} ${y2b} C ${midX} ${y2b}, ${midX} ${y1b}, ${x1} ${y1b} Z`}
        fill={n.color} fillOpacity={0.3} stroke="none"
      >
        <title>{`${n.name}: ¥${fmt(n.amount)} (${((n.amount / data.gross) * 100).toFixed(1)}%)`}</title>
      </path>
    );
    paths.push(<rect key={'r' + i} x={RIGHT_X} y={n.rightY} width={NODE_W} height={n.rightH} fill={n.color} rx={2} />);
    const labelY = n.rightY + n.rightH / 2 + 4;
    const pct = (n.amount / data.gross) * 100;
    labels.push(
      <text key={'l' + i} x={RIGHT_X + NODE_W + 8} y={labelY} fontSize="11" fill={t.tick}>
        <tspan fontWeight="600">{n.name}</tspan>
        <tspan dx="6" fill={t.axis} className="mono">¥{fmtCompact(n.amount)} ({pct.toFixed(0)}%)</tspan>
      </text>
    );
    leftY += lh;
  });

  return (
    <div className={PANEL} ref={wrapRef}>
      <div className="flex justify-between items-baseline mb-4">
        <div className="text-md font-semibold text-text-1 tracking-tight">月度现金流桑基</div>
        <div className="text-sm text-text-3">
          税前 <strong className="mono text-text-1 font-semibold">¥{fmt(data.gross)}</strong>
          <span className="mx-1.5 text-border-strong">·</span>
          净储蓄 <strong className="mono text-gain font-semibold">¥{fmt(data.savings)}</strong>
          <span className="mx-1.5 text-border-strong">·</span>
          储蓄率 <strong className="mono text-text-1">{data.net > 0 ? ((data.savings / data.net) * 100).toFixed(1) : '—'}%</strong>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} xmlns="http://www.w3.org/2000/svg" style={{ minWidth: 640 }}>
          {paths}
          <rect x={LEFT_X} y={PAD} width={NODE_W} height={leftH} fill={t.p50} rx={2} />
          <text x={LEFT_X - 8} y={PAD + leftH / 2 - 6} fontSize="12" fontWeight="600" fill={t.tick} textAnchor="end">税前合计</text>
          <text x={LEFT_X - 8} y={PAD + leftH / 2 + 10} fontSize="11" fill={t.axis} textAnchor="end">¥{fmt(data.gross)}/月</text>
          {labels}
        </svg>
      </div>
    </div>
  );
}
