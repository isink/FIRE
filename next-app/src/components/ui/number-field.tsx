'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 数字输入:本地编辑,失焦/回车才提交。
 * 敲字期间完全不碰 store、不触发 sim —— 根治"每个数字跑一次 5000 路径模拟
 * 导致主线程卡顿、受控 input 被 re-render 顶掉焦点"的问题。
 *
 * value: 外部数值(已提交值)
 * onCommit: 失焦/回车时回调,传入解析后的 number
 * format: 可选,外部值 → 显示字符串(如百分比 *100)。默认 String(value)
 * parse:  可选,输入字符串 → 提交数值。默认 Number()||0
 */
export interface NumberFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null | undefined;
  onCommit: (n: number) => void;
  format?: (v: number | null | undefined) => string;
  parse?: (s: string) => number;
  allowEmpty?: boolean;
}

export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  ({ value, onCommit, format, parse, allowEmpty, className, onFocus, onBlur, onKeyDown, ...props }, ref) => {
    const fmt = React.useCallback(
      (v: number | null | undefined) => (format ? format(v) : v == null ? '' : String(v)),
      [format]
    );
    const prs = React.useCallback(
      (s: string) => (parse ? parse(s) : Number(s) || 0),
      [parse]
    );

    const [local, setLocal] = React.useState<string>(() => fmt(value));
    const [editing, setEditing] = React.useState(false);

    // 非编辑态时,外部值变化(预设、滑块联动等)同步进来;编辑态不打扰用户
    React.useEffect(() => {
      if (!editing) setLocal(fmt(value));
    }, [value, editing, fmt]);

    const commit = (s: string) => {
      if (allowEmpty && s.trim() === '') {
        onCommit(NaN);
        return;
      }
      onCommit(prs(s));
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          'flex h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text-1 tabular-nums',
          'transition-[border-color,box-shadow] duration-fast ease-standard',
          'placeholder:text-text-3',
          'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={(e) => { setEditing(true); onFocus?.(e); }}
        onBlur={(e) => {
          setEditing(false);
          commit(e.target.value);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setLocal(fmt(value));
            setEditing(false);
            (e.target as HTMLInputElement).blur();
          }
          onKeyDown?.(e);
        }}
        {...props}
      />
    );
  }
);
NumberField.displayName = 'NumberField';
