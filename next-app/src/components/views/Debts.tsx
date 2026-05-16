'use client';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { NumberField } from '@/components/ui/number-field';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { fmt } from '@/lib/utils';
// @ts-ignore
import { summarizeLiabilities } from '@/lib/simulation';

export function Debts() {
 const plan = usePlanStore(s => s.plans[s.activePlanId]);
 const addLiability = usePlanStore(s => s.addLiability);
 const removeLiability = usePlanStore(s => s.removeLiability);
 const updateLiability = usePlanStore(s => s.updateLiability);

 if (!plan) return null;
 const debts = plan.liabilities || [];
 const summaries = debts.length > 0 ? summarizeLiabilities(plan) : [];
 const totalMonthly = summaries.reduce((s: number, x: any) => s + (x?.monthlyPayment || 0), 0);
 const totalBalance = summaries.reduce((s: number, x: any) => s + (x?.balance || 0), 0);

 return (
 <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
 <div className="flex justify-between items-start mb-6">
 <div>
 <h2 className="text-xl font-medium text-text-1 mb-1 tracking-tight">债务</h2>
 <p className="text-base text-text-3">房贷 / 车贷 / 信用贷等。月还款从现金流扣除直到还清。</p>
 </div>
 <div className="flex items-center gap-4 text-sm">
 <div className="text-text-3">总余额 <strong className="mono text-text-1">¥{fmt(totalBalance)}</strong></div>
 <div className="text-text-3">月还款 <strong className="mono text-text-1">¥{fmt(totalMonthly)}</strong></div>
 <Button variant="primary" size="sm" onClick={addLiability}><Plus className="w-3.5 h-3.5" /> 添加债务</Button>
 </div>
 </div>

 <div className="space-y-2">
 {debts.length === 0 ? (
 <div className="text-center text-base text-text-3 py-10 bg-surface-sunken rounded-lg">暂无债务</div>
 ) : debts.map((d: any, i: number) => {
 const sum = summaries[i];
 return (
 <Card key={d.id}>
 <CardContent className="p-4">
 <div className="flex items-center gap-3 mb-3">
 <Input
 value={d.name || ''}
 onChange={e => updateLiability(d.id, x => { x.name = e.target.value; })}
 placeholder="债务名"
 className="flex-1 font-medium border-0 border-b border-border rounded-none focus-visible:border-primary focus-visible:ring-0 px-0 h-8"
 />
 {sum && <div className="text-sm text-text-3">月供 <strong className="mono text-text-1">¥{fmt(sum.monthlyPayment)}</strong> · 剩余 <strong className="mono text-text-2">¥{fmt(sum.balance)}</strong></div>}
 <Button variant="ghost" size="icon-sm" onClick={() => removeLiability(d.id)} className="hover:text-destructive">
 <X className="w-4 h-4" />
 </Button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
 <div>
 <Label className="block mb-1">本金 ¥</Label>
 <NumberField value={d.principal ?? 0}
 onCommit={n => updateLiability(d.id, x => { x.principal = n || 0; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">年利率 %</Label>
 <NumberField
 value={d.rate ?? 0}
 format={v => ((v || 0) * 100).toFixed(2)}
 onCommit={n => updateLiability(d.id, x => { x.rate = (n || 0) / 100; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">年限</Label>
 <NumberField value={d.years ?? 25}
 onCommit={n => updateLiability(d.id, x => { x.years = n || 0; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">还款方式</Label>
 <NativeSelect
 value={d.paymentType || 'equal'}
 onChange={e => updateLiability(d.id, x => { x.paymentType = e.target.value; })}
 className="h-8"
 >
 <option value="equal">等额本息</option>
 <option value="principal">等额本金</option>
 </NativeSelect>
 </div>
 <div>
 <Label className="block mb-1">开始年</Label>
 <NumberField value={d.startYear ?? 2024}
 onCommit={n => updateLiability(d.id, x => { x.startYear = n || 0; })}
 className="h-8 text-right" />
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 );
}
