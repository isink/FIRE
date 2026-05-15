import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = (n: number | null | undefined) =>
  Math.round(Number(n) || 0).toLocaleString('zh-CN');

export const fmtCompact = (n: number | null | undefined): string => {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + ' 亿';
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(1) + ' 万';
  return sign + Math.round(abs).toString();
};

export const fmtSigned = (n: number) => (n >= 0 ? '+' : '') + fmt(n);
export const fmtCompactSigned = (n: number) => (n >= 0 ? '+' : '') + fmtCompact(n);

export const newId = () => Math.random().toString(36).slice(2, 10);
export const _thisYear = new Date().getFullYear();
