'use client';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { fmt, _thisYear } from '@/lib/utils';

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
  const saAtRetire = (Number(pension.currentSocialAverage) || 11000) * Math.pow(1 + inflRate, yearsToSS);
  const totalYears = (Number(pension.yearsContributed) || 0) + yearsToSS;
  const basic = saAtRetire * (1 + (Number(pension.contributionIndex) || 1)) / 2 * totalYears * 0.01;
  const personal = (Number(pension.personalAccountBalance) || 0) / Math.max(60, Number(pension.payoutMonths) || 139);
  const monthly60 = basic + personal;

  return (
    <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-1 mb-1 tracking-tight">生命阶段</h2>
        <p className="text-base text-text-3 leading-relaxed">人生切成三段，每段独立的月支出 / 收入比例。退休年龄由「家庭」中各人 retireYear 决定。</p>
      </div>

      {/* Timeline — 单色阶梯, 非彩虹: 在职 slate / 过渡 brand / 退休 深色 */}
      <div className="mb-6 flex h-12 rounded-lg overflow-hidden ring-1 ring-border">
        <div className="flex flex-col justify-center px-4 text-white text-sm bg-chart-2" style={{ flex: Math.max(1, (tranEnabled ? tranYear : hhRetireYear) - _thisYear) }}>
          <span className="font-semibold">在职</span>
          <span className="mono opacity-85 text-xs">{_thisYear} — {tranEnabled ? tranYear : hhRetireYear}</span>
        </div>
        {tranEnabled && (
          <div className="flex flex-col justify-center px-4 text-white text-sm bg-primary/75" style={{ flex: Math.max(1, hhRetireYear - tranYear) }}>
            <span className="font-semibold">过渡期</span>
            <span className="mono opacity-85 text-xs">{tranYear} — {hhRetireYear}</span>
          </div>
        )}
        <div className="flex flex-col justify-center px-4 text-white text-sm bg-text-1" style={{ flex: 2 }}>
          <span className="font-semibold">退休</span>
          <span className="mono opacity-85 text-xs">{hhRetireYear} +</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {/* Working */}
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-center pb-2 mb-3 border-b border-border">
              <span className="font-semibold text-text-1 inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-chart-2"></span>在职
              </span>
              <span className="text-xs text-text-3">当下起</span>
            </div>
            <Label className="block mb-1">月支出 ¥</Label>
            <Input type="number" step={500} placeholder={String(plan.expense || 12000)}
              value={st.working?.monthlyExpense ?? ''}
              onChange={e => updateStage('working', s => { s.monthlyExpense = e.target.value === '' ? null : Number(e.target.value); })}
              className="h-8 text-right" />
            <div className="text-xs text-text-3 mt-1.5">留空 = 用全局月支出 <span className="mono">¥{fmt(plan.expense || 0)}</span></div>
          </CardContent>
        </Card>

        {/* Transition */}
        <Card className={tranEnabled ? '' : 'opacity-60'}>
          <CardContent className="p-4">
            <div className="flex justify-between items-center pb-2 mb-3 border-b border-border">
              <label className="font-semibold text-text-1 inline-flex items-center gap-2 cursor-pointer">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/75"></span>过渡期
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
            <Input type="number" min={_thisYear} max={2100}
              value={st.transition?.startYear ?? _thisYear + 20}
              onChange={e => updateStage('transition', s => { s.startYear = Number(e.target.value); })}
              disabled={!tranEnabled} className="h-8 text-right mb-2" />
            <Label className="block mb-1">月支出 ¥</Label>
            <Input type="number" step={500} placeholder={String(plan.expense || 12000)}
              value={st.transition?.monthlyExpense ?? ''}
              onChange={e => updateStage('transition', s => { s.monthlyExpense = e.target.value === '' ? null : Number(e.target.value); })}
              disabled={!tranEnabled} className="h-8 text-right mb-2" />
            <Label className="block mb-1">收入倍数</Label>
            <Input type="number" min={0} max={1} step={0.05}
              value={st.transition?.incomeMultiplier ?? 1}
              onChange={e => updateStage('transition', s => { s.incomeMultiplier = Number(e.target.value); })}
              disabled={!tranEnabled} className="h-8 text-right" />
            <div className="text-xs text-text-3 mt-1.5">0=无 · 0.5=半职 · 1=全职</div>
          </CardContent>
        </Card>

        {/* Retired */}
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-center pb-2 mb-3 border-b border-border">
              <span className="font-semibold text-text-1 inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-text-1"></span>退休
              </span>
              <span className="text-xs text-text-3">按 SWR / 月支出取款</span>
            </div>
            <Label className="block mb-1">家庭退休年（最后一人）</Label>
            <Input type="number" value={hhRetireYear} disabled className="h-8 text-right opacity-70" />
            <div className="text-xs text-text-3 mt-1.5 mb-3">编辑请去「家庭」标签</div>
            <Label className="block mb-1">月支出 ¥</Label>
            <Input type="number" step={500} placeholder={String(plan.retirementExpense || plan.expense || 10000)}
              value={st.retired?.monthlyExpense ?? ''}
              onChange={e => updateStage('retired', s => { s.monthlyExpense = e.target.value === '' ? null : Number(e.target.value); })}
              className="h-8 text-right" />
          </CardContent>
        </Card>
      </div>

      {/* Pension + Healthcare gap */}
      <Card className={pension.enabled ? '' : 'opacity-70'}>
        <CardContent className="p-4">
          <div className="flex justify-between items-center pb-3 mb-4 border-b border-border">
            <label className="font-semibold text-text-1 inline-flex items-center gap-2 cursor-pointer">
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
              <div>
                <Label className="block mb-1">已缴年限</Label>
                <Input type="number" min={0} max={40} step={1} value={pension.yearsContributed ?? 5}
                  onChange={e => updatePension(p => { p.yearsContributed = Number(e.target.value) || 0; })}
                  className="h-8 text-right" />
              </div>
              <div>
                <Label className="block mb-1">缴费指数</Label>
                <Input type="number" min={0.6} max={3} step={0.1} value={pension.contributionIndex ?? 1}
                  onChange={e => updatePension(p => { p.contributionIndex = Number(e.target.value) || 1; })}
                  className="h-8 text-right" />
              </div>
              <div>
                <Label className="block mb-1">当前社平 ¥/月</Label>
                <Input type="number" min={3000} max={50000} step={500} value={pension.currentSocialAverage ?? 11000}
                  onChange={e => updatePension(p => { p.currentSocialAverage = Number(e.target.value) || 0; })}
                  className="h-8 text-right" />
              </div>
              <div>
                <Label className="block mb-1">个人账户余额 ¥</Label>
                <Input type="number" min={0} step={1000} value={pension.personalAccountBalance ?? 50000}
                  onChange={e => updatePension(p => { p.personalAccountBalance = Number(e.target.value) || 0; })}
                  className="h-8 text-right" />
              </div>
              <div>
                <Label className="block mb-1">退休医疗缺口 ¥/月</Label>
                <Input type="number" min={0} step={100} value={plan.healthcareGapMonthly ?? 500}
                  onChange={e => updateActive(p => { p.healthcareGapMonthly = Number(e.target.value) || 0; })}
                  className="h-8 text-right" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
