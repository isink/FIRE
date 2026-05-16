'use client';
import { useState } from 'react';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, X, Pencil, CalendarClock } from 'lucide-react';
import { fmt, fmtCompact, _thisYear } from '@/lib/utils';
import { cn } from '@/lib/utils';

const PRESETS: Record<string, any> = {
 house: { name: '买房首付', year: _thisYear + 5, amount: -1500000, monthly: false, monthlyDelta: 0 },
 child: { name: '生娃加支出', year: _thisYear + 3, amount: 0, monthly: true, monthlyDelta: -5000 },
 pension: { name: '社保领取', year: _thisYear + 30, amount: 0, monthly: true, monthlyDelta: 3000 },
};

export function Events() {
 const plan = usePlanStore(s => s.plans[s.activePlanId]);
 const addEvent = usePlanStore(s => s.addEvent);
 const removeEvent = usePlanStore(s => s.removeEvent);
 const saveEvent = usePlanStore(s => s.saveEvent);
 const [editing, setEditing] = useState<any>(null);

 if (!plan) return null;
 const events = plan.events || [];

 const openModal = (ev: any) => setEditing(ev || { id: Math.random().toString(36).slice(2, 10), name: '', year: _thisYear + 5, amount: -100000, monthly: false, monthlyDelta: 0 });

 return (
 <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
 <div className="mb-6">
 <h2 className="text-xl font-medium text-text-1 mb-1 tracking-tight">时间线事件</h2>
 <p className="text-base text-text-3">一次性事件（买房首付）冲减资产；持续性事件（社保、生娃支出）每月调整现金流。</p>
 </div>

 <div className="flex flex-wrap gap-2 mb-4">
 {Object.entries(PRESETS).map(([k, p]: any) => (
 <Button key={k} variant="outline" size="sm" onClick={() => addEvent(p)}>+ {p.name}</Button>
 ))}
 <Button variant="primary" size="sm" onClick={() => openModal(null)}>
 <Plus className="w-3.5 h-3.5" /> 自定义
 </Button>
 </div>

 {events.length === 0 ? (
 <div className="flex flex-col items-center justify-center text-center py-16 rounded-lg bg-surface">
 <div className="w-10 h-10 rounded-full bg-surface-sunken grid place-items-center mb-3">
 <CalendarClock className="w-5 h-5 text-text-3" strokeWidth={1.75} />
 </div>
 <div className="text-base font-medium text-text-2">时间线上还没有事件</div>
 <div className="text-sm text-text-3 mt-1">用上方预设，或「自定义」加一次性 / 持续性现金流</div>
 </div>
 ) : (
 <Card>
 {events.map((ev: any, i: number) => {
 const typeTag = ev.monthly ? '持续' : '一次';
 const isPositive = ev.monthly ? ev.monthlyDelta >= 0 : ev.amount >= 0;
 const impactText = ev.monthly
 ? (ev.monthlyDelta >= 0 ? '+' : '') + fmt(ev.monthlyDelta) + '/月'
 : (ev.amount >= 0 ? '+' : '') + fmtCompact(ev.amount);
 return (
 <div
 key={ev.id}
 className="flex items-center gap-4 px-4 py-2.5 even:bg-surface-sunken/40 border-b border-border/60 last:border-0"
 >
 <div className="text-md mono font-medium text-text-1 w-14">{ev.year}</div>
 <div className="flex-1 flex items-center gap-2">
 <span className="text-xs px-1.5 py-0.5 rounded-sm bg-surface-sunken text-text-3 font-medium">{typeTag}</span>
 <span className="font-medium text-text-1">{ev.name}</span>
 </div>
 {/* 红=正/收入, 绿=负/支出 per 中国惯例 */}
 <div className={cn('mono text-base font-medium', isPositive ? 'text-gain' : 'text-loss')}>{impactText}</div>
 <Button variant="ghost" size="icon-sm" onClick={() => openModal(ev)}><Pencil className="w-3.5 h-3.5" /></Button>
 <Button variant="ghost" size="icon-sm" onClick={() => removeEvent(ev.id)} className="hover:text-destructive"><X className="w-3.5 h-3.5" /></Button>
 </div>
 );
 })}
 </Card>
 )}

 <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
 <DialogContent>
 <DialogHeader><DialogTitle>{editing && events.find((e: any) => e.id === editing.id) ? '编辑事件' : '添加事件'}</DialogTitle></DialogHeader>
 {editing && (
 <div className="space-y-3">
 <div>
 <Label className="block mb-1.5">事件名称</Label>
 <Input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="例：买房首付" />
 </div>
 <div>
 <Label className="block mb-1.5">触发年份</Label>
 <Input type="number" min={2024} max={2080} value={editing.year} onChange={e => setEditing({ ...editing, year: Number(e.target.value) })} />
 </div>
 <div>
 <Label className="block mb-1.5">类型</Label>
 <NativeSelect
 value={editing.monthly ? 'monthly' : 'lump'}
 onChange={e => setEditing({ ...editing, monthly: e.target.value === 'monthly' })}
 >
 <option value="lump">一次性（正=收入，负=支出）</option>
 <option value="monthly">持续性（每月固定金额从该年起）</option>
 </NativeSelect>
 </div>
 <div>
 <Label className="block mb-1.5">{editing.monthly ? '月度变化 ¥' : '一次性金额 ¥'}</Label>
 <Input
 type="number" step={10000}
 value={editing.monthly ? editing.monthlyDelta : editing.amount}
 onChange={e => setEditing({ ...editing, [editing.monthly ? 'monthlyDelta' : 'amount']: Number(e.target.value) })}
 />
 </div>
 </div>
 )}
 <DialogFooter>
 <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
 <Button variant="primary" onClick={() => {
 if (editing) {
 const ev = {
 ...editing,
 amount: editing.monthly ? 0 : editing.amount,
 monthlyDelta: editing.monthly ? editing.monthlyDelta : 0,
 };
 saveEvent(ev);
 setEditing(null);
 }
 }}>保存</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
