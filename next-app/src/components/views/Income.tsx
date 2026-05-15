'use client';
import { useState } from 'react';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { fmt, _thisYear } from '@/lib/utils';
// @ts-ignore
import { CITY_PRESETS, grossToNet, calcSpecialDeductionsMonthly } from '@/lib/tax';

const DED_PRESETS: Array<{ key: string; label: string; hint: string; quick: number[] }> = [
  { key: 'mortgage', label: '房贷利息', hint: '首套 1000', quick: [0, 1000] },
  { key: 'rent', label: '租房', hint: '一线 1500 / 二线 1100', quick: [0, 1500, 1100, 800] },
  { key: 'kidsEducation', label: '子女教育', hint: '每个孩子 2000', quick: [0, 2000, 4000] },
  { key: 'infant', label: '婴幼儿照护', hint: '每个 ≤3 岁 2000', quick: [0, 2000, 4000] },
  { key: 'parentsCare', label: '赡养老人', hint: '独生 3000 / 非独 1500', quick: [0, 3000, 1500] },
  { key: 'education', label: '继续教育', hint: '学历 400 / 职业 300', quick: [0, 400, 300] },
];

/* 段控: 税前/税后, 自住/出租 等通用切换 */
function Segmented({ options, value, onChange }: { options: { v: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex gap-0.5 p-0.5 bg-surface-sunken rounded-md">
      {options.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'px-3 py-1 text-sm rounded-sm transition-all duration-fast ease-standard',
            value === o.v ? 'bg-surface text-text-1 shadow-e1 font-medium' : 'text-text-3 hover:text-text-2'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TaxConfig() {
  const plan = usePlanStore(s => s.plans[s.activePlanId]);
  const updateActive = usePlanStore(s => s.updateActive);
  const [open, setOpen] = useState(false);

  const tc = plan?.taxConfig;
  if (!plan || !tc) return null;
  const sd = calcSpecialDeductionsMonthly(tc);

  return (
    <Card className="mb-3">
      <button
        type="button"
        className="w-full flex justify-between items-center px-5 py-3.5 hover:bg-surface-sunken rounded-t-lg transition-colors duration-fast"
        onClick={() => setOpen(o => !o)}
      >
        <div className="text-left">
          <div className="text-md font-semibold text-text-1">税务设置</div>
          <div className="text-sm text-text-3 mt-0.5">
            <span className="text-text-2 font-medium">{(CITY_PRESETS as any)[tc.city]?.label || tc.city}</span>
            <span className="mx-1.5 text-border-strong">·</span>
            <span>专项附加扣除 <span className="mono">¥{fmt(sd)}</span>/月</span>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-text-3" /> : <ChevronDown className="w-4 h-4 text-text-3" />}
      </button>
      {open && (
        <CardContent className="border-t border-border pt-4">
          <div className="mb-4">
            <Label className="block mb-1.5">缴费城市</Label>
            <NativeSelect
              value={tc.city}
              onChange={e => updateActive(p => { p.taxConfig.city = e.target.value; })}
              className="max-w-xs"
            >
              {Object.entries(CITY_PRESETS as any).map(([k, v]: any) => (
                <option key={k} value={k}>{v.label || k}</option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DED_PRESETS.map(d => (
              <div key={d.key} className="bg-surface-sunken rounded-md p-3 ring-1 ring-border/60">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm font-medium text-text-2">{d.label}</span>
                  <span className="text-xs text-text-3">{d.hint}</span>
                </div>
                <Input
                  type="number" min={0} step={100}
                  value={tc.specialDeductions?.[d.key] || 0}
                  onChange={e => updateActive(p => {
                    p.taxConfig.specialDeductions = p.taxConfig.specialDeductions || {};
                    p.taxConfig.specialDeductions[d.key] = Number(e.target.value) || 0;
                  })}
                  className="h-8 text-right bg-surface"
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {d.quick.map(v => (
                    <button
                      key={v}
                      type="button"
                      className="text-xs px-2 py-0.5 bg-surface ring-1 ring-border hover:bg-primary hover:text-primary-foreground hover:ring-primary text-text-3 rounded-sm transition-colors duration-fast"
                      onClick={() => updateActive(p => {
                        p.taxConfig.specialDeductions = p.taxConfig.specialDeductions || {};
                        p.taxConfig.specialDeductions[d.key] = v;
                      })}
                    >{v === 0 ? '清零' : v}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function StreamRow({ stream, person }: { stream: any; person: any }) {
  const plan = usePlanStore(s => s.plans[s.activePlanId]);
  const updatePerson = usePlanStore(s => s.updatePerson);
  const removeStream = usePlanStore(s => s.removeIncomeStream);

  const upd = (mut: (s: any) => void) => updatePerson(person.id, p => {
    const ss = (p.incomeStreams || []).find((x: any) => x.id === stream.id);
    if (ss) mut(ss);
  });

  const isGross = (stream.type || 'net') === 'gross';
  const breakdown = isGross && stream.monthlyAmount > 0 ? grossToNet(Number(stream.monthlyAmount) || 0, plan.taxConfig) : null;

  return (
    <Card className="mb-2">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Input
            value={stream.name || ''}
            onChange={e => upd(s => { s.name = e.target.value; })}
            placeholder="收入名称"
            className="flex-1 font-medium border-0 border-b border-border rounded-none focus-visible:border-primary focus-visible:ring-0 px-0 h-8"
          />
          <Segmented
            options={[{ v: 'gross', label: '税前' }, { v: 'net', label: '税后' }]}
            value={isGross ? 'gross' : 'net'}
            onChange={v => upd(s => { s.type = v; })}
          />
          <Button variant="ghost" size="icon-sm" onClick={() => removeStream(stream.id)} className="hover:text-destructive">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="block mb-1">{isGross ? '税前月薪 ¥' : '税后月入 ¥'}</Label>
            <Input type="number" step={500} value={stream.monthlyAmount ?? 0}
              onChange={e => upd(s => { s.monthlyAmount = Number(e.target.value) || 0; })}
              className="h-8 text-right" />
          </div>
          <div>
            <Label className="block mb-1">年增长 %</Label>
            <Input type="number" step={0.5} min={0} max={20}
              value={((stream.annualGrowth || 0) * 100).toFixed(1)}
              onChange={e => upd(s => { s.annualGrowth = (Number(e.target.value) || 0) / 100; })}
              className="h-8 text-right" />
          </div>
          <div>
            <Label className="block mb-1">开始年</Label>
            <Input type="number" min={2000} max={2100} value={stream.startYear ?? _thisYear}
              onChange={e => upd(s => { s.startYear = Number(e.target.value) || null; })}
              className="h-8 text-right" />
          </div>
          <div>
            <Label className="block mb-1">结束年</Label>
            <Input type="number" min={2000} max={2100} placeholder="不限" value={stream.endYear ?? ''}
              onChange={e => upd(s => { s.endYear = e.target.value ? Number(e.target.value) : null; })}
              className="h-8 text-right" />
          </div>
        </div>

        {breakdown && (
          <div className="mt-3 p-3 bg-surface-sunken rounded-md ring-1 ring-border/60 text-sm space-y-1">
            <div className="flex justify-between text-text-2"><span>税前</span><span className="mono text-text-1">¥{fmt(breakdown.gross)}</span></div>
            <div className="flex justify-between text-text-2"><span>− 五险一金</span><span className="mono">¥{fmt(breakdown.socialIns)}</span></div>
            <div className="flex justify-between text-text-2"><span>− 个税</span><span className="mono">¥{fmt(breakdown.tax)}</span></div>
            <div className="flex justify-between font-semibold text-text-1 border-t border-border pt-1.5 mt-1">
              <span>= 实发</span><span className="mono">¥{fmt(breakdown.net)}</span>
            </div>
            <div className="text-xs text-text-3 pt-1">
              边际税率 <span className="mono">{(breakdown.marginalRate * 100).toFixed(0)}%</span> · 实际税负 <span className="mono">{(breakdown.effectiveRate * 100).toFixed(1)}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Income() {
  const plan = usePlanStore(s => s.plans[s.activePlanId]);
  const addStream = usePlanStore(s => s.addIncomeStream);
  if (!plan) return null;

  return (
    <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-1 mb-1 tracking-tight">收入来源</h2>
        <p className="text-base text-text-3">税前月薪输入会自动算到实发。退休后收入自动停。</p>
      </div>

      <TaxConfig />

      {(plan.people || []).map((person: any) => (
        <div key={person.id} className="mb-6">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-border">
            <div>
              <div className="text-md font-semibold text-text-1">{person.name || '成员'}</div>
              <div className="text-sm text-text-3 mt-0.5">退休 <span className="mono">{person.retireYear || '?'}</span> 年</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => addStream(person.id)}>
              <Plus className="w-3.5 h-3.5" /> 添加收入
            </Button>
          </div>
          {(person.incomeStreams || []).length === 0 ? (
            <div className="text-center text-base text-text-3 py-6 bg-surface-sunken rounded-lg">
              {person.name || '此人'} 暂无收入
            </div>
          ) : (
            (person.incomeStreams || []).map((s: any) => (
              <StreamRow key={s.id} stream={s} person={person} />
            ))
          )}
        </div>
      ))}
    </div>
  );
}
