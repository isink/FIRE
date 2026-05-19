'use client';
import { useState, useEffect, useMemo } from 'react';
import { runTizhinei, type TzInput, type TzResult } from '@/lib/tz/engine';
import { track } from '@/lib/tz/track';
import { REGIME_PRESETS } from '@/lib/civilService';

function sid() {
  if (typeof window === 'undefined') return 'ssr';
  let s = localStorage.getItem('tz_sid');
  if (!s) { s = Math.random().toString(36).slice(2); localStorage.setItem('tz_sid', s); }
  return s;
}

export default function TzPage() {
  const session = useMemo(sid, []);
  const [inp, setInp] = useState<TzInput>({
    age: 32, regimeKey: 'institution', monthlyNet: 9000,
    housingFundMonthly: 4000, occupationalPensionMonthly: 1500,
    savings: 300000, targetRetireAge: 50,
  });
  const [res, setRes] = useState<TzResult | null>(null);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from') || 'direct';
    track('page_view', session, { from });
  }, [session]);

  const set = (k: keyof TzInput, v: number | string) =>
    setInp(p => ({ ...p, [k]: typeof p[k] === 'number' ? Number(v) : v }));

  const calc = () => {
    const r = runTizhinei(inp);
    setRes(r);
    track('calc_done', session, { regime: inp.regimeKey, retireAge: inp.targetRetireAge });
  };

  const cta = () => {
    track('cta_click', session, {});
    window.location.href = `/tz/interest?s=${session}`;
  };

  const NumberRow = ({ label, k, suffix }: { label: string; k: keyof TzInput; suffix?: string }) => (
    <label className="flex items-center justify-between py-2 border-b border-neutral-200">
      <span className="text-sm text-neutral-600">{label}</span>
      <span><input type="number" inputMode="numeric" value={inp[k] as number}
        onChange={e => set(k, e.target.value)}
        className="w-28 text-right border rounded px-2 py-1" />{suffix && <span className="ml-1 text-xs text-neutral-400">{suffix}</span>}</span>
    </label>
  );

  return (
    <main className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-1">体制内 · 多少岁能 FIRE</h1>
      <p className="text-xs text-neutral-400 mb-4">粗算工具 · 编制养老金/公积金/职业年金已纳入</p>

      <div className="space-y-1">
        <NumberRow label="年龄" k="age" suffix="岁" />
        <label className="flex items-center justify-between py-2 border-b border-neutral-200">
          <span className="text-sm text-neutral-600">编制类型</span>
          <select value={inp.regimeKey} onChange={e => set('regimeKey', e.target.value)}
            className="border rounded px-2 py-1 text-sm">
            {REGIME_PRESETS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <NumberRow label="月到手" k="monthlyNet" suffix="元" />
        <NumberRow label="公积金月缴(双边)" k="housingFundMonthly" suffix="元" />
        <NumberRow label="职业年金月缴" k="occupationalPensionMonthly" suffix="元" />
        <NumberRow label="现有存款" k="savings" suffix="元" />
        <NumberRow label="目标退休年龄" k="targetRetireAge" suffix="岁" />
      </div>

      <button onClick={calc} className="w-full mt-5 bg-red-700 text-white rounded-lg py-3 font-medium">
        粗算一下
      </button>

      {res && (
        <section className="mt-6 p-4 rounded-lg bg-neutral-50 border">
          <div className="text-sm text-neutral-500">假设退休月开支 ≈ ¥{res.retireExpenseAssumed}（当前到手 70%）</div>
          <div className="mt-2 text-lg font-semibold">
            {res.yearsToFire == null
              ? `目标退休年龄前，按粗算未达 FIRE`
              : `约 ${Math.round(res.yearsToFire)} 年后达到 FIRE 目标`}
          </div>
          <p className="mt-3 text-sm text-neutral-700">{res.hook}</p>
          <button onClick={cta} className="w-full mt-4 border-2 border-red-700 text-red-700 rounded-lg py-3 font-medium">
            生成体制内专属 FIRE 方案 PDF · ¥39
          </button>
        </section>
      )}
    </main>
  );
}
