'use client';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { NumberField } from '@/components/ui/number-field';
import { NativeSelect } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { fmt, _thisYear } from '@/lib/utils';
import { REGIME_PRESETS, regimeByKey, CHONGQING_SOCIAL_AVG } from '@/lib/civilService';

export function Stages() {
 const plan = usePlanStore(s => s.plans[s.activePlanId]);
 const updateStage = usePlanStore(s => s.updateStage);
 const updatePension = usePlanStore(s => s.updatePension);
 const updateActive = usePlanStore(s => s.updateActive);

 if (!plan) return null;

 const st = plan.stages || {};
 const tranEnabled = !!st.transition?.enabled;
 const retYear = st.retired?.startYear || (_thisYear + 25);
 const tranYear = st.transition?.startYear ?? (_thisYear + 20);

 const people = plan.people || [];
 const hhRetireYear = people.length
 ? Math.max(...people.map((p: any) => p.retireYear || retYear))
 : retYear;

 const pension = plan.pension || {};
 const inflRate = plan.infl || 0.025;
 const age = _thisYear - (plan.birthYear || _thisYear - 30);
 const yearsToSS = Math.max(0, 60 - age);
 const saAtRetire = (Number(pension.currentSocialAverage) || CHONGQING_SOCIAL_AVG) * Math.pow(1 + inflRate, yearsToSS);
 const totalYears = (Number(pension.yearsContributed) || 0) + yearsToSS;
 const basic = saAtRetire * (1 + (Number(pension.contributionIndex) || 1)) / 2 * totalYears * 0.01;
 const personal = (Number(pension.personalAccountBalance) || 0) / Math.max(60, Number(pension.payoutMonths) || 139);
 const monthly60 = basic + personal;

 return (
 <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
 <div className="mb-6">
 <h2 className="text-xl font-medium text-text-1 mb-1 tracking-tight">生命阶段</h2>
 <p className="text-base text-text-3 leading-relaxed">人生切成三段，每段独立的月支出 / 收入比例。退休年龄由「家庭」中各人 retireYear 决定。</p>
 </div>

 {/* Timeline — 单色阶梯, 非彩虹: 在职 slate / 过渡 brand / 退休 深色 */}
 <div className="mb-6 flex h-12 rounded-lg overflow-hidden ring-1 ring-border">
 <div className="flex flex-col justify-center px-4 text-white text-sm bg-chart-2" style={{ flex: Math.max(1, (tranEnabled ? tranYear : hhRetireYear) - _thisYear) }}>
 <span className="font-medium">在职</span>
 <span className="mono opacity-85 text-xs">{_thisYear} — {tranEnabled ? tranYear : hhRetireYear}</span>
 </div>
 {tranEnabled && (
 <div className="flex flex-col justify-center px-4 text-white text-sm bg-primary/75" style={{ flex: Math.max(1, hhRetireYear - tranYear) }}>
 <span className="font-medium">过渡期</span>
 <span className="mono opacity-85 text-xs">{tranYear} — {hhRetireYear}</span>
 </div>
 )}
 <div className="flex flex-col justify-center px-4 text-white text-sm bg-text-1" style={{ flex: 2 }}>
 <span className="font-medium">退休</span>
 <span className="mono opacity-85 text-xs">{hhRetireYear} +</span>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
 {/* Working */}
 <Card>
 <CardContent className="p-4">
 <div className="flex justify-between items-center pb-2 mb-3 border-b border-border">
 <span className="font-medium text-text-1 inline-flex items-center gap-2">
 在职
 </span>
 <span className="text-xs text-text-3">当下起</span>
 </div>
 <Label className="block mb-1">月支出 ¥</Label>
 <NumberField allowEmpty placeholder={String(plan.expense || 12000)}
 value={st.working?.monthlyExpense ?? null}
 onCommit={n => updateStage('working', s => { s.monthlyExpense = Number.isNaN(n) ? null : n; })}
 className="h-8 text-right" />
 <div className="text-xs text-text-3 mt-1.5">留空 = 用全局月支出 <span className="mono">¥{fmt(plan.expense || 0)}</span></div>
 </CardContent>
 </Card>

 {/* Transition */}
 <Card className={tranEnabled ? '' : 'opacity-60'}>
 <CardContent className="p-4">
 <div className="flex justify-between items-center pb-2 mb-3 border-b border-border">
 <label className="font-medium text-text-1 inline-flex items-center gap-2 cursor-pointer">
 过渡期
 </label>
 <Switch
 checked={tranEnabled}
 onCheckedChange={(checked) => updateStage('transition', s => {
 s.enabled = checked;
 if (checked) {
 if (s.startYear == null) s.startYear = _thisYear + 20;
 if (s.incomeMultiplier == null) s.incomeMultiplier = 0.5;
 }
 })}
 />
 </div>
 <Label className="block mb-1">起始年</Label>
 <NumberField
 value={st.transition?.startYear ?? _thisYear + 20}
 onCommit={n => updateStage('transition', s => { s.startYear = n || 0; })}
 disabled={!tranEnabled} className="h-8 text-right mb-2" />
 <Label className="block mb-1">月支出 ¥</Label>
 <NumberField allowEmpty placeholder={String(plan.expense || 12000)}
 value={st.transition?.monthlyExpense ?? null}
 onCommit={n => updateStage('transition', s => { s.monthlyExpense = Number.isNaN(n) ? null : n; })}
 disabled={!tranEnabled} className="h-8 text-right mb-2" />
 <Label className="block mb-1">收入倍数</Label>
 <NumberField
 value={st.transition?.incomeMultiplier ?? 1}
 onCommit={n => updateStage('transition', s => { s.incomeMultiplier = n || 0; })}
 disabled={!tranEnabled} className="h-8 text-right" />
 <div className="text-xs text-text-3 mt-1.5">0=无 · 0.5=半职 · 1=全职</div>
 </CardContent>
 </Card>

 {/* Retired */}
 <Card>
 <CardContent className="p-4">
 <div className="flex justify-between items-center pb-2 mb-3 border-b border-border">
 <span className="font-medium text-text-1 inline-flex items-center gap-2">
 退休
 </span>
 <span className="text-xs text-text-3">按 SWR / 月支出取款</span>
 </div>
 <Label className="block mb-1">家庭退休年（最后一人）</Label>
 <Input type="number" value={hhRetireYear} disabled className="h-8 text-right opacity-70" />
 <div className="text-xs text-text-3 mt-1.5 mb-3">编辑请去「家庭」标签</div>
 <Label className="block mb-1">月支出 ¥</Label>
 <NumberField allowEmpty placeholder={String(plan.retirementExpense || plan.expense || 10000)}
 value={st.retired?.monthlyExpense ?? null}
 onCommit={n => updateStage('retired', s => { s.monthlyExpense = Number.isNaN(n) ? null : n; })}
 className="h-8 text-right" />
 </CardContent>
 </Card>
 </div>

 {/* Pension + Healthcare gap */}
 <Card className={pension.enabled ? '' : 'opacity-70'}>
 <CardContent className="p-4">
 <div className="flex justify-between items-center pb-3 mb-4 border-b border-border">
 <label className="font-medium text-text-1 inline-flex items-center gap-2 cursor-pointer">
 社保养老金 / 医疗缺口
 </label>
 <div className="flex items-center gap-3">
 <span className="text-sm mono text-text-2">
 {pension.enabled ? `60 岁起 ¥${fmt(monthly60)}/月` : '未启用'}
 </span>
 <Switch checked={!!pension.enabled} onCheckedChange={(c) => updatePension(p => { p.enabled = c; })} />
 </div>
 </div>
 {pension.enabled && (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div className="md:col-span-3">
 <Label className="block mb-1">编制类型<span className="text-text-3">(重庆口径,选中即填缴费指数,可再手改)</span></Label>
 <NativeSelect
 value={pension.regimeType || ''}
 onChange={e => updatePension(p => {
 const r = regimeByKey(e.target.value);
 p.regimeType = e.target.value;
 if (r) p.contributionIndex = r.contributionIndex;
 if (p.currentSocialAverage == null) p.currentSocialAverage = CHONGQING_SOCIAL_AVG;
 })}
 className="max-w-xs h-8"
 >
 <option value="">— 选择编制 —</option>
 {REGIME_PRESETS.map(r => (
 <option key={r.key} value={r.key}>{r.label} · 缴费指数≈{r.contributionIndex}（{r.hint}）</option>
 ))}
 </NativeSelect>
 </div>
 <div>
 <Label className="block mb-1">已缴年限</Label>
 <NumberField value={pension.yearsContributed ?? 5}
 onCommit={n => updatePension(p => { p.yearsContributed = n || 0; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">缴费指数</Label>
 <NumberField value={pension.contributionIndex ?? 1}
 onCommit={n => updatePension(p => { p.contributionIndex = n || 1; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">社平/计发基数 ¥/月<span className="text-text-3">(重庆默认)</span></Label>
 <NumberField value={pension.currentSocialAverage ?? CHONGQING_SOCIAL_AVG}
 onCommit={n => updatePension(p => { p.currentSocialAverage = n || 0; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">个人账户余额 ¥</Label>
 <NumberField value={pension.personalAccountBalance ?? 50000}
 onCommit={n => updatePension(p => { p.personalAccountBalance = n || 0; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">退休医疗缺口 ¥/月</Label>
 <NumberField value={plan.healthcareGapMonthly ?? 500}
 onCommit={n => updateActive(p => { p.healthcareGapMonthly = n || 0; })}
 className="h-8 text-right" />
 </div>
 </div>
 )}
 </CardContent>
 </Card>

 {/* 公积金模块 */}
 {(() => {
 const hf = plan.housingFund || {};
 return (
 <Card className={'mt-3 ' + (hf.enabled ? '' : 'opacity-70')}>
 <CardContent className="p-4">
 <div className="flex justify-between items-center pb-3 mb-4 border-b border-border">
 <label className="font-medium text-text-1">公积金<span className="text-text-3">(体制内典型:冲房贷,还清后转可投资)</span></label>
 <Switch checked={!!hf.enabled} onCheckedChange={(c) => updateActive(p => { p.housingFund = { ...(p.housingFund || {}), enabled: c }; })} />
 </div>
 {hf.enabled && (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div>
 <Label className="block mb-1">月缴存合计 ¥<span className="text-text-3">(单位+个人)</span></Label>
 <NumberField value={hf.monthlyContribution ?? 0}
 onCommit={n => updateActive(p => { p.housingFund = { ...(p.housingFund || {}), monthlyContribution: n || 0 }; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">当前账户余额 ¥</Label>
 <NumberField value={hf.balance ?? 0}
 onCommit={n => updateActive(p => { p.housingFund = { ...(p.housingFund || {}), balance: n || 0 }; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">用途</Label>
 <label className="flex items-center gap-2 h-8 text-base text-text-2 cursor-pointer">
 <Switch checked={hf.offsetMortgage !== false}
 onCheckedChange={(c) => updateActive(p => { p.housingFund = { ...(p.housingFund || {}), offsetMortgage: c }; })} />
 <span>{hf.offsetMortgage !== false ? '冲房贷' : '直接计入储蓄'}</span>
 </label>
 </div>
 <div className="md:col-span-3 text-xs text-text-3 leading-relaxed">
 冲房贷:公积金优先抵月供(等额抵消、不重复计),超出部分按 1.5% 结息累积;房贷还清后账户余额一次性释放、之后缴存全额转可投资。
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
 })()}

 {/* 职业年金独立账户 */}
 {(() => {
 const op = plan.occupationalPension || {};
 const monthly = op.payout !== 'lump';
 return (
 <Card className={'mt-3 ' + (op.enabled ? '' : 'opacity-70')}>
 <CardContent className="p-4">
 <div className="flex justify-between items-center pb-3 mb-4 border-b border-border">
 <label className="font-medium text-text-1">职业年金<span className="text-text-3">(机关事业单位 单位8%+个人4%,记账利率约4%)</span></label>
 <Switch checked={!!op.enabled} onCheckedChange={(c) => updateActive(p => { p.occupationalPension = { ...(p.occupationalPension || {}), enabled: c }; })} />
 </div>
 {op.enabled && (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div>
 <Label className="block mb-1">当前账户余额 ¥</Label>
 <NumberField value={op.balance ?? 0}
 onCommit={n => updateActive(p => { p.occupationalPension = { ...(p.occupationalPension || {}), balance: n || 0 }; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">月缴存合计 ¥<span className="text-text-3">(单位+个人)</span></Label>
 <NumberField value={op.monthlyContribution ?? 0}
 onCommit={n => updateActive(p => { p.occupationalPension = { ...(p.occupationalPension || {}), monthlyContribution: n || 0 }; })}
 className="h-8 text-right" />
 </div>
 <div>
 <Label className="block mb-1">退休领取方式</Label>
 <label className="flex items-center gap-2 h-8 text-base text-text-2 cursor-pointer">
 <Switch checked={monthly}
 onCheckedChange={(c) => updateActive(p => { p.occupationalPension = { ...(p.occupationalPension || {}), payout: c ? 'monthly' : 'lump' }; })} />
 <span>{monthly ? '按月发(计发月数)' : '一次性领取'}</span>
 </label>
 </div>
 <div className="md:col-span-3 text-xs text-text-3 leading-relaxed">
 退休前按记账利率(默认4%)累积、缴存计入专户(不影响在职现金流);退休时:按月=账户÷计发月数(与基本养老金一致,默认139)逐月发完,一次性=整笔转入可投资。
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
 })()}
 </div>
 );
}
