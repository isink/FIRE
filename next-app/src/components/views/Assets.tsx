'use client';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { NumberField } from '@/components/ui/number-field';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
// @ts-ignore
import { ASSET_CATEGORY_DEFAULTS } from '@/lib/simulation';

const TYPE_LABELS: Record<string, string> = {
 cash: '现金', fund: '基金', stock: '股票', gold: '黄金', crypto: '加密币',
 hkstock: '港股', usstock: '美股', ipa: '养老金', property: '房产',
};
const TYPE_OPTIONS = Object.keys(TYPE_LABELS);

/* 桶标签: 去彩虹, 统一 slate, 语义靠文字而非颜色 */
const BUCKET_LABELS: Record<string, string> = {
 cash: '现金桶 · 优先取款',
 taxable: '应税桶',
 ipa: 'IPA 桶 · 60 岁后取',
 property: '房产桶 · 不可日常取',
};

function AssetRow({ asset }: { asset: any }) {
 const updateAsset = usePlanStore(s => s.updateAsset);
 const removeAsset = usePlanStore(s => s.removeAsset);

 const def = ASSET_CATEGORY_DEFAULTS[asset.type] || null;
 const bucket = def?.bucket || 'taxable';
 const isCash = asset.type === 'cash' || asset.type === 'ipa';
 const isProp = asset.type === 'property';

 return (
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center gap-3 mb-3">
 <NativeSelect
 value={asset.type}
 onChange={e => updateAsset(asset.id, a => {
 a.type = e.target.value;
 const d = ASSET_CATEGORY_DEFAULTS[e.target.value];
 if (d) { a.expectedReturn = d.ret; a.volatility = d.vol; }
 if (e.target.value === 'property') {
 a.propertyMode = a.propertyMode || 'self';
 a.monthlyMaintenance = a.monthlyMaintenance ?? 500;
 }
 })}
 className="w-24 h-8"
 >
 {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
 </NativeSelect>
 <Input
 value={asset.name || ''}
 onChange={e => updateAsset(asset.id, a => { a.name = e.target.value; })}
 placeholder={isCash ? '账户名（如 余额宝）' : isProp ? '房产名' : '资产名'}
 className="flex-1 font-medium border-0 border-b border-border rounded-none focus-visible:border-primary focus-visible:ring-0 px-0 h-8"
 />
 <span className="text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap bg-surface-sunken text-text-2">
 {BUCKET_LABELS[bucket]}
 </span>
 <Button variant="ghost" size="icon-sm" onClick={() => removeAsset(asset.id)} className="hover:text-destructive">
 <X className="w-4 h-4" />
 </Button>
 </div>

 {isProp ? (
 <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
 <div>
 <Label className="block mb-1">模式</Label>
 <div className="inline-flex gap-0.5 p-0.5 bg-surface-sunken rounded-md">
 <button onClick={() => updateAsset(asset.id, a => { a.propertyMode = 'self'; a.monthlyRent = 0; })}
 className={cn('px-3 py-1 text-sm rounded-sm transition-all duration-fast', (asset.propertyMode || 'self') === 'self' ? 'bg-surface text-text-1 shadow-e1 font-medium' : 'text-text-3')}>自住</button>
 <button onClick={() => updateAsset(asset.id, a => { a.propertyMode = 'rental'; })}
 className={cn('px-3 py-1 text-sm rounded-sm transition-all duration-fast', asset.propertyMode === 'rental' ? 'bg-surface text-text-1 shadow-e1 font-medium' : 'text-text-3')}>出租</button>
 </div>
 </div>
 <div>
 <Label className="block mb-1">当前估值 ¥</Label>
 <NumberField value={asset.amountCny ?? 0}
 onCommit={n => updateAsset(asset.id, a => { a.amountCny = n || 0; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">月物业费 ¥</Label>
 <NumberField value={asset.monthlyMaintenance ?? 500}
 onCommit={n => updateAsset(asset.id, a => { a.monthlyMaintenance = n || 0; })}
 className="h-8 text-right" />
 </div>
 {asset.propertyMode === 'rental' && (
 <div>
 <Label className="block mb-1">月租金 ¥</Label>
 <NumberField value={asset.monthlyRent ?? 0}
 onCommit={n => updateAsset(asset.id, a => { a.monthlyRent = n || 0; })}
 className="h-8 text-right" />
 </div>
 )}
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 {!isCash && (
 <div>
 <Label className="block mb-1">代码</Label>
 <Input value={asset.code || ''}
 onChange={e => updateAsset(asset.id, a => { a.code = e.target.value; })}
 placeholder="005827 / sh510300 / AU9999" className="h-8" />
 </div>
 )}
 <div>
 <Label className="block mb-1">{isCash ? '当前余额 ¥' : '持仓金额 ¥'}</Label>
 <NumberField value={asset.amountCny ?? 0}
 onCommit={n => updateAsset(asset.id, a => { a.amountCny = n || 0; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">月定投 ¥</Label>
 <NumberField value={asset.dcaAmount ?? 0}
 onCommit={n => updateAsset(asset.id, a => { a.dcaAmount = n || 0; })}
 className="h-8 text-right" />
 </div>
 </div>
 )}

 <div className="flex items-end gap-3 pt-3 mt-3 border-t border-border">
 <div className="flex-1">
 <div className="flex justify-between mb-1">
 <Label>预期年化</Label>
 <span className="text-xs text-text-3">默认 <span className="mono">{def ? (def.ret * 100).toFixed(1) : '7.0'}%</span></span>
 </div>
 <NumberField
 value={asset.expectedReturn != null ? asset.expectedReturn : (def?.ret ?? 0.07)}
 format={v => ((v ?? 0) * 100).toFixed(1)}
 onCommit={n => updateAsset(asset.id, a => { a.expectedReturn = (n || 0) / 100; })}
 className="h-8 text-right" />
 </div>
 <div className="flex-1">
 <div className="flex justify-between mb-1">
 <Label>年化波动率</Label>
 <span className="text-xs text-text-3">默认 <span className="mono">{def ? (def.vol * 100).toFixed(1) : '15.0'}%</span></span>
 </div>
 <NumberField
 value={asset.volatility != null ? asset.volatility : (def?.vol ?? 0.15)}
 format={v => ((v ?? 0) * 100).toFixed(1)}
 onCommit={n => updateAsset(asset.id, a => { a.volatility = (n || 0) / 100; })}
 className="h-8 text-right" />
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

export function Assets() {
 const plan = usePlanStore(s => s.plans[s.activePlanId]);
 const addAsset = usePlanStore(s => s.addAsset);
 if (!plan) return null;

 return (
 <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
 <div className="flex justify-between items-start mb-6">
 <div>
 <h2 className="text-xl font-medium text-text-1 mb-1 tracking-tight">资产</h2>
 <p className="text-base text-text-3">每个资产独立的预期收益率和波动率。退休按"现金 → 应税 → IPA → 房产"四桶顺序取款。</p>
 </div>
 <Button variant="primary" size="sm" onClick={addAsset}><Plus className="w-3.5 h-3.5" /> 添加资产</Button>
 </div>

 <div className="space-y-2">
 {(plan.assets || []).map((a: any) => <AssetRow key={a.id} asset={a} />)}
 </div>
 </div>
 );
}
