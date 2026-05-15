'use client';
import { useState } from 'react';
import { usePlanStore } from '@/store/plan';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, X, Pencil, Target } from 'lucide-react';
import { fmt, fmtCompact, _thisYear } from '@/lib/utils';
import { cn } from '@/lib/utils';

const PRESETS: Record<string, any> = {
  house: { name: '买房首付', year: _thisYear + 5, amount: 1500000, priority: 1 },
  edu: { name: '子女教育金', year: _thisYear + 18, amount: 500000, priority: 1 },
  car: { name: '换车', year: _thisYear + 4, amount: 300000, priority: 2 },
  study: { name: '海外留学', year: _thisYear + 20, amount: 800000, priority: 2 },
};

/* 优先级 = 中性 ramp, 不用涨跌色 */
const PRIO_STYLE: Record<number, { label: string; cls: string }> = {
  1: { label: '必须', cls: 'bg-primary/10 text-primary' },
  2: { label: '希望', cls: 'bg-surface-sunken text-text-2' },
  3: { label: '可选', cls: 'bg-surface-sunken text-text-3' },
};

function GoalCard({ goal, baselineSim }: { goal: any; baselineSim: any }) {
  const removeGoal = usePlanStore(s => s.removeGoal);
  const toggleGoalDisabled = usePlanStore(s => s.toggleGoalDisabled);
  const updateGoal = usePlanStore(s => s.updateGoal);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(goal);

  const yearsAway = goal.year - _thisYear;
  let p50: number | null = null;
  if (baselineSim?.yearlyRows) {
    const row = baselineSim.yearlyRows.find((r: any) => r.year === goal.year);
    if (row) p50 = row.portfolioP50;
  }
  /* 承担能力 = pass/fail 语义 (非涨跌): 可覆盖→brand, 紧张→中性, 不足→destructive */
  let fundedStatus = '—', fundedCls = 'bg-surface-sunken text-text-3';
  if (p50 != null && goal.amount > 0) {
    const ratio = p50 / goal.amount;
    if (ratio >= 2) { fundedStatus = '✓ 充裕'; fundedCls = 'bg-primary/10 text-primary'; }
    else if (ratio >= 1) { fundedStatus = '✓ 可覆盖'; fundedCls = 'bg-primary/10 text-primary'; }
    else if (ratio >= 0.6) { fundedStatus = '⚠ 紧张'; fundedCls = 'bg-surface-sunken text-text-2'; }
    else { fundedStatus = '✗ 不足'; fundedCls = 'bg-destructive/10 text-destructive'; }
  }
  const prio = PRIO_STYLE[goal.priority || 1];

  return (
    <>
      <Card className={cn(goal.disabled && 'opacity-60')}>
        <CardContent className="p-4">
          <div className="flex justify-between items-center pb-3 mb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-text-1">{goal.name || '目标'}</span>
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-sm', prio.cls)}>{prio.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleGoalDisabled(goal.id)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-sm ring-1 transition-colors duration-fast',
                  goal.disabled
                    ? 'ring-border text-text-3'
                    : 'ring-primary/25 bg-primary/10 text-primary'
                )}
              >
                {goal.disabled ? '已暂停' : '启用中'}
              </button>
              <Button variant="ghost" size="icon-sm" onClick={() => { setForm(goal); setEditing(true); }}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => removeGoal(goal.id)} className="hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-text-3">目标金额</div>
              <div className="text-lg font-semibold mono text-text-1 mt-1">¥{fmtCompact(goal.amount || 0)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-text-3">目标年份</div>
              <div className="text-lg font-semibold mono text-text-1 mt-1">{goal.year}</div>
              <div className="text-xs text-text-3">{yearsAway > 0 ? yearsAway + ' 年后' : yearsAway === 0 ? '今年' : '已过'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-text-3">届时 P50</div>
              <div className="text-lg font-semibold mono text-text-1 mt-1">{p50 != null ? '¥' + fmtCompact(p50) : '—'}</div>
              <div className="text-xs text-text-3">无目标基线</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-text-3">承担能力</div>
              <div className={cn('inline-block mt-1 text-sm font-semibold px-2 py-1 rounded-sm', fundedCls)}>{fundedStatus}</div>
              {p50 != null && goal.amount > 0 && (
                <div className="text-xs text-text-3 mt-0.5">覆盖率 <span className="mono">{((p50 / goal.amount) * 100).toFixed(0)}%</span></div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑目标</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="block mb-1.5">目标名称</Label>
              <Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：买房首付 / 留学" />
            </div>
            <div>
              <Label className="block mb-1.5">目标年份</Label>
              <Input type="number" min={2024} max={2080} value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="block mb-1.5">目标金额 ¥</Label>
              <Input type="number" step={10000} min={0} value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="block mb-1.5">优先级</Label>
              <NativeSelect value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })}>
                <option value={1}>必须达成（买房 / 子女教育）</option>
                <option value={2}>希望达成（换车 / 家电）</option>
                <option value={3}>可选（升级旅行 / 奢侈）</option>
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>取消</Button>
            <Button variant="primary" onClick={() => { updateGoal(goal.id, g => Object.assign(g, form)); setEditing(false); }}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Goals() {
  const plan = usePlanStore(s => s.plans[s.activePlanId]);
  const sim = usePlanStore(s => s.sim);
  const baselineSim = usePlanStore(s => s.baselineSim);
  const addGoal = usePlanStore(s => s.addGoal);

  if (!plan) return null;
  const goals = plan.goals || [];
  const activeGoals = goals.filter((g: any) => !g.disabled);
  const totalAmount = activeGoals.reduce((s: number, g: any) => s + (g.amount || 0), 0);

  let fireDelta: number | null = null;
  if (activeGoals.length > 0 && baselineSim && sim) {
    if (baselineSim.yearsToFire != null && sim.yearsToFire != null) {
      fireDelta = sim.yearsToFire - baselineSim.yearsToFire;
    }
  }

  return (
    <div className="px-6 py-5 overflow-y-auto h-full max-w-5xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-1 mb-1 tracking-tight">目标</h2>
          <p className="text-base text-text-3">目标 = 计划某年的大额支出。每张卡显示"届时是否能覆盖" + "该目标使 FIRE 推迟几年"。</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-text-3">规划数 <strong className="mono text-text-1">{activeGoals.length}</strong></div>
          <div className="text-text-3">总规划 <strong className="mono text-text-1">¥{fmt(totalAmount)}</strong></div>
          {/* FIRE 推迟是坏事 → 绿(loss) per 中国惯例 */}
          <div className="text-text-3">FIRE 推迟 <strong className={cn('mono', fireDelta != null && Math.abs(fireDelta) >= 0.05 ? 'text-loss' : 'text-text-1')}>{fireDelta != null ? (Math.abs(fireDelta) < 0.05 ? '无影响' : `+${fireDelta.toFixed(1)} 年`) : '—'}</strong></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(PRESETS).map(([key, preset]: any) => (
          <Button key={key} variant="outline" size="sm" onClick={() => addGoal(preset)}>+ {preset.name}</Button>
        ))}
        <Button variant="primary" size="sm" onClick={() => addGoal()}>
          <Plus className="w-3.5 h-3.5" /> 自定义
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 rounded-lg ring-1 ring-border bg-surface">
          <div className="w-10 h-10 rounded-full bg-surface-sunken grid place-items-center mb-3">
            <Target className="w-5 h-5 text-text-3" strokeWidth={1.75} />
          </div>
          <div className="text-base font-medium text-text-2">还没有规划目标</div>
          <div className="text-sm text-text-3 mt-1">点上方预设快速添加，或「自定义」任意填</div>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((g: any) => <GoalCard key={g.id} goal={g} baselineSim={baselineSim} />)}
        </div>
      )}
    </div>
  );
}
