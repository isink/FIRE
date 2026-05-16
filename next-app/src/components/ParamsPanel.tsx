'use client';
import { usePlanStore } from '@/store/plan';
import { fmt, _thisYear } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
// @ts-ignore
import { ASSET_CATEGORY_DEFAULTS } from '@/lib/simulation';

interface Row {
 label: string;
 key: string;
 min: number; max: number; step: number;
 isPct?: boolean;
 fmtFn?: (v: number) => string;
}

const ROWS: Row[] = [
 { label: '财富自由目标', key: 'target', min: 2000000, max: 50000000, step: 500000, fmtFn: v => '¥' + fmt(v) },
 { label: '月支出', key: 'expense', min: 0, max: 30000, step: 500, fmtFn: v => '¥' + fmt(v) },
 { label: '年化预期收益', key: 'ret', min: 0, max: 20, step: 0.5, isPct: true, fmtFn: v => v.toFixed(1) + '%' },
 { label: '年化波动率', key: 'vol', min: 0, max: 40, step: 1, isPct: true, fmtFn: v => Math.round(v) + '%' },
 { label: '通胀率', key: 'infl', min: 0, max: 8, step: 0.1, isPct: true, fmtFn: v => v.toFixed(1) + '%' },
 { label: '收入年增长率', key: 'incomeGrowth', min: 0, max: 10, step: 0.5, isPct: true, fmtFn: v => v.toFixed(1) + '%' },
 { label: '税费 / 摩擦成本', key: 'taxDrag', min: 0, max: 2, step: 0.1, isPct: true, fmtFn: v => v.toFixed(1) + '%' },
 { label: '安全提取率 (SWR)', key: 'swr', min: 2, max: 6, step: 0.1, isPct: true, fmtFn: v => v.toFixed(1) + '%' },
 { label: '模拟年数', key: 'years', min: 5, max: 50, step: 1, fmtFn: v => Math.round(v) + ' 年' },
];

const PRESETS = [
 { name: '保守', retMul: 0.7, volMul: 0.6, infl: 0.020, swr: 0.035 },
 { name: '平衡', retMul: 1.0, volMul: 1.0, infl: 0.025, swr: 0.035 },
 { name: '激进', retMul: 1.3, volMul: 1.3, infl: 0.025, swr: 0.040 },
];

function ParamSlider({ row, plan, update }: { row: Row; plan: any; update: (mut: (p: any) => void) => void }) {
 const v = row.isPct ? (plan[row.key] || 0) * 100 : (plan[row.key] || 0);
 return (
 <div className="mb-3.5">
 <div className="flex justify-between items-baseline mb-1.5">
 <span className="text-sm text-text-2 font-medium">{row.label}</span>
 <span className="text-base font-medium text-text-1 mono">
 {row.fmtFn ? row.fmtFn(v) : v}
 </span>
 </div>
 <Slider
 min={row.min}
 max={row.max}
 step={row.step}
 value={[v]}
 onValueChange={(vals) => {
 const raw = Number(vals[0]);
 update(p => { p[row.key] = row.isPct ? raw / 100 : raw; });
 }}
 />
 </div>
 );
}

export function ParamsPanel() {
 const plan = usePlanStore(s => s.plans[s.activePlanId]);
 const updateActive = usePlanStore(s => s.updateActive);

 if (!plan) return null;

 const applyPreset = (preset: typeof PRESETS[0]) => {
 updateActive(p => {
 (p.assets || []).forEach((a: any) => {
 const def = (ASSET_CATEGORY_DEFAULTS as any)[a.type];
 if (def) {
 a.expectedReturn = +(def.ret * preset.retMul).toFixed(4);
 a.volatility = +(def.vol * preset.volMul).toFixed(4);
 }
 });
 p.ret = 0.07 * preset.retMul;
 p.vol = 0.18 * preset.volMul;
 p.infl = preset.infl;
 p.swr = preset.swr;
 });
 };

 const birthYear = plan.birthYear || _thisYear - 30;

 return (
 <aside className="border-l border-border bg-surface overflow-y-auto">
 <div className="px-5 py-4 border-b border-border">
 <div className="text-xs font-medium text-text-3 mb-2.5">参数预设</div>
 <div className="grid grid-cols-3 gap-1 p-1 bg-surface-sunken rounded-md">
 {PRESETS.map(preset => {
 const isActive = Math.abs((plan.ret || 0.07) - 0.07 * preset.retMul) < 0.005;
 return (
 <button
 key={preset.name}
 onClick={() => applyPreset(preset)}
 className={cn(
 'py-1.5 rounded-sm text-sm font-medium transition-all duration-fast ease-standard',
 isActive
 ? 'bg-surface text-primary shadow-e1 font-medium'
 : 'text-text-2 hover:text-text-1'
 )}
 >
 {preset.name}
 </button>
 );
 })}
 </div>
 </div>

 <div className="px-5 py-4">
 <div className="text-xs font-medium text-text-3 mb-3">模型杠杆</div>
 {ROWS.map(r => (
 <ParamSlider key={r.key} row={r} plan={plan} update={updateActive} />
 ))}
 </div>

 <div className="px-5 py-4 border-t border-border">
 <div className="text-xs font-medium text-text-3 mb-3">人口与策略</div>
 <div className="mb-3.5">
 <div className="flex justify-between items-baseline mb-1.5">
 <span className="text-sm text-text-2 font-medium">出生年份</span>
 <span className="text-base font-medium text-text-1 mono">
 {birthYear}<span className="text-text-3 font-normal">（{_thisYear - birthYear} 岁）</span>
 </span>
 </div>
 <Slider
 min={1950} max={2010} step={1}
 value={[birthYear]}
 onValueChange={(vals) => updateActive(p => { p.birthYear = Number(vals[0]); })}
 />
 <div className="text-xs text-text-3 mt-1.5">用于 IPA 60 岁解锁判断</div>
 </div>

 <div className="pt-3 mt-1 border-t border-border">
 <label className="flex items-center justify-between gap-2 cursor-pointer">
 <span className="text-base text-text-2">启用 Glide path<span className="text-text-3">（按年龄减仓）</span></span>
 <Switch
 checked={!!plan.glidePath?.enabled}
 onCheckedChange={(checked) => updateActive(p => {
 p.glidePath = p.glidePath || { enabled: false, equityFloorPct: 30 };
 p.glidePath.enabled = checked;
 })}
 />
 </label>
 {plan.glidePath?.enabled && (
 <div className="mt-3 pl-1">
 <div className="flex justify-between items-baseline mb-1.5">
 <span className="text-sm text-text-2 font-medium">权益下限</span>
 <span className="text-base font-medium text-text-1 mono">{plan.glidePath?.equityFloorPct ?? 30}%</span>
 </div>
 <Slider
 min={0} max={80} step={5}
 value={[plan.glidePath?.equityFloorPct ?? 30]}
 onValueChange={(vals) => updateActive(p => {
 p.glidePath = p.glidePath || { enabled: true, equityFloorPct: 30 };
 p.glidePath.equityFloorPct = Number(vals[0]);
 })}
 />
 </div>
 )}
 </div>
 </div>

 <div className="px-5 py-4 text-xs text-text-3 leading-relaxed border-t border-border">
 仅供参考，不构成投资建议。<br />
 预设基于 A 股历史口径。SWR 建议 3-4%（A 股波动高于美股）。
 </div>
 </aside>
 );
}
