'use client';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumberField } from '@/components/ui/number-field';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { fmt } from '@/lib/utils';

export function Expenses() {
 const plan = usePlanStore(s => s.plans[s.activePlanId]);
 const addCat = usePlanStore(s => s.addExpenseCategory);
 const removeCat = usePlanStore(s => s.removeExpenseCategory);
 const updateCat = usePlanStore(s => s.updateExpenseCategory);

 if (!plan) return null;
 const cats = plan.expenseCategories || [];
 const total = cats.reduce((s: number, c: any) => s + (Number(c.monthly) || 0), 0);
 const weightedInfl = total > 0 ? cats.reduce((s: number, c: any) => s + (Number(c.monthly) || 0) * (Number(c.inflationRate) || 0), 0) / total : 0;

 return (
 <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
 <div className="flex justify-between items-start mb-6">
 <div>
 <h2 className="text-xl font-medium text-text-1 mb-1 tracking-tight">支出分类</h2>
 <p className="text-base text-text-3">每类独立的月支出 + 通胀率。医疗 / 教育通胀高于 CPI（默认已预设）。</p>
 </div>
 <div className="flex items-center gap-4 text-sm">
 <div className="text-text-3">月支出合计 <strong className="mono text-text-1">¥{fmt(total)}</strong></div>
 <div className="text-text-3">加权通胀 <strong className="mono text-text-1">{(weightedInfl * 100).toFixed(2)}%</strong></div>
 <Button variant="primary" size="sm" onClick={addCat}><Plus className="w-3.5 h-3.5" /> 添加类别</Button>
 </div>
 </div>

 {cats.length === 0 ? (
 <div className="text-center text-base text-text-3 py-10 bg-surface-sunken rounded-lg">暂无支出类别</div>
 ) : (
 <Card>
 <div className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-3 px-4 py-2.5 border-b border-border text-sm font-medium text-text-3">
 <span>类别</span>
 <span className="text-right">月支出 ¥</span>
 <span className="text-right">年通胀 %</span>
 <span className="w-7" />
 </div>
 {cats.map((c: any, i: number) => (
 <div
 key={c.id}
 className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-3 px-4 py-2 items-center even:bg-surface-sunken/40 border-b border-border/60 last:border-0"
 >
 <Input
 value={c.name || ''}
 onChange={e => updateCat(c.id, x => { x.name = e.target.value; })}
 placeholder="类别名"
 className="font-medium border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:bg-surface-sunken px-1 h-8"
 />
 <NumberField
 value={c.monthly || 0}
 onCommit={n => updateCat(c.id, x => { x.monthly = n || 0; })}
 className="h-8 text-right"
 />
 <NumberField
 value={c.inflationRate ?? 0.025}
 format={v => ((v ?? 0.025) * 100).toFixed(1)}
 onCommit={n => updateCat(c.id, x => { x.inflationRate = (n || 0) / 100; })}
 className="h-8 text-right"
 />
 <Button variant="ghost" size="icon-sm" onClick={() => removeCat(c.id)} className="hover:text-destructive">
 <X className="w-4 h-4" />
 </Button>
 </div>
 ))}
 </Card>
 )}
 </div>
 );
}
