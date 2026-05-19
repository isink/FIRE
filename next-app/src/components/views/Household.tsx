'use client';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { NumberField } from '@/components/ui/number-field';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { _thisYear, fmt } from '@/lib/utils';

export function Household() {
 const plan = usePlanStore(s => s.plans[s.activePlanId]);
 const updatePerson = usePlanStore(s => s.updatePerson);
 const addSpouse = usePlanStore(s => s.addSpouse);
 const removeSpouse = usePlanStore(s => s.removeSpouse);

 if (!plan) return null;

 return (
 <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
 <div className="mb-6">
 <div className="flex items-center gap-2.5 mb-1">
 <h2 className="text-xl font-medium text-text-1 tracking-tight">家庭成员</h2>
 <span className="text-sm text-text-3">人数 <strong className="mono text-text-2">{plan.people?.length || 1}</strong></span>
 </div>
 <p className="text-base text-text-3 leading-relaxed">每人独立设置出生年和计划退休年。家庭层&ldquo;退休&rdquo;以最后一个人退休为准；社保按每人 60 岁分别触发；收入流归属到具体的人，在其退休年自动停。</p>
 </div>

 <div className="space-y-3">
 {(plan.people || []).map((person: any, idx: number) => {
 const age = _thisYear - (person.birthYear || _thisYear);
 return (
 <Card key={person.id}>
 <CardContent className="p-5">
 <div className="flex items-center gap-3 pb-3 mb-4 border-b border-border">
 <Input
 value={person.name || ''}
 onChange={e => updatePerson(person.id, p => { p.name = e.target.value; })}
 placeholder="姓名"
 className="flex-1 max-w-xs font-medium"
 />
 <span className="text-sm text-text-2 bg-surface-sunken px-2.5 py-1 rounded-full mono">{age} 岁</span>
 {idx > 0 && (
 <Button variant="outline" size="icon-sm" onClick={() => removeSpouse(person.id)} className="hover:text-destructive hover:border-destructive/40">
 <X className="w-4 h-4" />
 </Button>
 )}
 </div>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div>
 <Label className="block mb-1.5">出生年份</Label>
 <NumberField
 value={person.birthYear ?? _thisYear - 30}
 onCommit={n => updatePerson(person.id, p => { p.birthYear = n || 0; })}
 />
 </div>
 <div>
 <Label className="block mb-1.5">计划退休年</Label>
 <NumberField
 value={person.retireYear ?? _thisYear + 25}
 onCommit={n => updatePerson(person.id, p => { p.retireYear = n || 0; })}
 />
 <div className="text-xs text-text-3 mt-1.5">
 退休 = <span className="mono">{person.retireYear ? person.retireYear - (person.birthYear || _thisYear - 30) : '?'}</span> 岁
 </div>
 </div>
 <div>
 <Label className="block mb-1.5">收入流</Label>
 <div className="bg-surface-sunken rounded-md p-2.5 space-y-1 min-h-[40px] text-sm">
 {(person.incomeStreams || []).length === 0 ? (
 <span className="text-text-3">在「收入」标签添加</span>
 ) : (
 (person.incomeStreams || []).map((s: any) => (
 <div key={s.id} className="flex justify-between">
 <span className="text-text-2">{s.name || '收入'}</span>
 <span className="mono text-text-1">{s.type === 'gross' ? '税前' : '税后'} ¥{fmt(s.monthlyAmount)}/月</span>
 </div>
 ))
 )}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}

 {(plan.people || []).length < 2 && (
 <Button variant="subtle" onClick={addSpouse} className="w-full border border-dashed border-border-strong">
 <Plus className="w-4 h-4" /> 添加配偶
 </Button>
 )}
 </div>
 </div>
 );
}
