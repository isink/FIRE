'use client';

/**
 * Chart 色板 — 单一真源 = globals.css 的 CSS 变量。
 * 杀彩虹: 四桶走 slate 单色阶梯, target 走品牌红, 盈亏走数据语义色。
 * 运行时读 computed CSS var, 与 Tailwind token 永不分叉。
 */

function readVar(name: string, alpha = 1): string {
  if (typeof window === 'undefined') return `hsl(0 0% 0% / ${alpha})`;
  const triplet = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${triplet} / ${alpha})`;
}

export function chartTheme() {
  return {
    /* 四桶单色阶梯 (现金 → 应税 → IPA → 房产) */
    bucket: [
      readVar('--chart-1'),
      readVar('--chart-2'),
      readVar('--chart-3'),
      readVar('--chart-4'),
    ],
    bucketFill: [
      readVar('--chart-1', 0.9),
      readVar('--chart-2', 0.85),
      readVar('--chart-3', 0.85),
      readVar('--chart-4', 0.8),
    ],
    /* P50 中线 = slate-900, 不确定带 = slate-200 */
    p50: readVar('--text-1'),
    band: readVar('--border', 0.9),
    /* target = 品牌红虚线 (唯一品牌红入图) */
    target: readVar('--brand'),
    /* 数据语义 (红=涨/盈, 绿=跌/亏) */
    gain: readVar('--gain'),
    gainFill: readVar('--gain', 0.14),
    loss: readVar('--loss'),
    lossFill: readVar('--loss', 0.14),
    locked: readVar('--locked'),
    /* 轴/网格 — 极淡, 不抢数据 */
    grid: readVar('--border', 0.6),
    axis: readVar('--text-3'),
    tick: readVar('--text-2'),
    tooltipBg: readVar('--text-1'),
    tooltipFg: readVar('--surface'),
  };
}

export type ChartTheme = ReturnType<typeof chartTheme>;
