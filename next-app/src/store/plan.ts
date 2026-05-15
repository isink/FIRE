'use client';
import { create } from 'zustand';
import { defaultPlan } from '@/lib/defaults';
// @ts-ignore
import { runSim } from '@/lib/simulation';

const STORAGE_KEY = 'fire-state-v15';

interface Store {
  plans: Record<string, any>;
  activePlanId: string;
  compareMode: boolean;
  chartStyle: 'stack' | 'line';
  sim: any | null;
  baselineSim: any | null;  // for goals: sim without goals
  ready: boolean;

  // actions
  init: () => void;
  save: () => void;
  setActive: (id: string) => void;
  toggleCompare: () => void;
  setChartStyle: (s: 'stack' | 'line') => void;
  rerun: () => void;

  // plan-level setters
  updateActive: (mutate: (plan: any) => void) => void;
  updateAsset: (id: string, mutate: (a: any) => void) => void;
  addAsset: () => void;
  removeAsset: (id: string) => void;

  // people / income
  addIncomeStream: (personId: string) => void;
  removeIncomeStream: (streamId: string) => void;
  addSpouse: () => void;
  removeSpouse: (personId: string) => void;
  updatePerson: (id: string, mutate: (p: any) => void) => void;

  // expense categories
  addExpenseCategory: () => void;
  removeExpenseCategory: (id: string) => void;
  updateExpenseCategory: (id: string, mutate: (c: any) => void) => void;

  // stages
  updateStage: (key: 'working' | 'transition' | 'retired', mutate: (s: any) => void) => void;
  updatePension: (mutate: (p: any) => void) => void;

  // goals
  addGoal: (preset?: any) => void;
  removeGoal: (id: string) => void;
  toggleGoalDisabled: (id: string) => void;
  updateGoal: (id: string, mutate: (g: any) => void) => void;

  // events
  addEvent: (preset?: any) => void;
  saveEvent: (ev: any) => void;
  removeEvent: (id: string) => void;

  // debts
  addLiability: () => void;
  removeLiability: (id: string) => void;
  updateLiability: (id: string, mutate: (d: any) => void) => void;

  // plan mgmt
  duplicatePlan: () => void;
  renamePlan: (newName: string) => void;
  deleteActivePlan: () => void;
}

function load(): Pick<Store, 'plans' | 'activePlanId' | 'compareMode' | 'chartStyle'> {
  if (typeof window === 'undefined') {
    const p = defaultPlan();
    return { plans: { [p.id]: p }, activePlanId: p.id, compareMode: false, chartStyle: 'stack' };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.plans && s?.activePlanId && s.plans[s.activePlanId]) {
        return {
          plans: s.plans,
          activePlanId: s.activePlanId,
          compareMode: !!s.compareMode,
          chartStyle: s.chartStyle || 'stack',
        };
      }
    }
  } catch {}
  const p = defaultPlan();
  return { plans: { [p.id]: p }, activePlanId: p.id, compareMode: false, chartStyle: 'stack' };
}

function persist(state: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      plans: state.plans,
      activePlanId: state.activePlanId,
      compareMode: state.compareMode,
      chartStyle: state.chartStyle,
    }));
  } catch {}
}

let simTimer: any = null;

export const usePlanStore = create<Store>((set, get) => ({
  plans: {},
  activePlanId: '',
  compareMode: false,
  chartStyle: 'stack',
  sim: null,
  baselineSim: null,
  ready: false,

  init: () => {
    if (get().ready) return;
    const s = load();
    set({ ...s, ready: true });
    setTimeout(() => get().rerun(), 0);
  },

  save: () => {
    persist(get());
  },

  setActive: (id) => {
    set({ activePlanId: id });
    get().save();
    get().rerun();
  },

  toggleCompare: () => {
    set({ compareMode: !get().compareMode });
    get().save();
    get().rerun();
  },

  setChartStyle: (s) => {
    set({ chartStyle: s });
    get().save();
  },

  rerun: () => {
    clearTimeout(simTimer);
    simTimer = setTimeout(() => {
      const state = get();
      const plan = state.plans[state.activePlanId];
      if (!plan) return;
      try {
        const sim = runSim(plan);
        const goals = (plan.goals || []).filter((g: any) => !g.disabled);
        const baselineSim = goals.length > 0
          ? runSim({ ...plan, goals: [] })
          : null;
        set({ sim, baselineSim });
      } catch (e) {
        console.error('sim error', e);
      }
    }, 140);
  },

  updateActive: (mutate) => {
    const state = get();
    const plan = { ...state.plans[state.activePlanId] };
    mutate(plan);
    set({ plans: { ...state.plans, [plan.id]: plan } });
    get().save();
    get().rerun();
  },

  updateAsset: (id, mutate) => {
    get().updateActive(plan => {
      const a = plan.assets.find((x: any) => x.id === id);
      if (a) mutate(a);
    });
  },

  addAsset: () => {
    get().updateActive(plan => {
      plan.assets.push({
        id: Math.random().toString(36).slice(2, 10),
        type: 'cash',
        name: '现金',
        amountCny: 0,
        expectedReturn: 0.02,
        volatility: 0.005,
        status: 'ok',
      });
    });
  },

  removeAsset: (id) => {
    get().updateActive(plan => {
      plan.assets = plan.assets.filter((a: any) => a.id !== id);
    });
  },

  addIncomeStream: (personId) => {
    get().updateActive(plan => {
      const person = plan.people?.find((p: any) => p.id === personId);
      if (!person) return;
      person.incomeStreams = person.incomeStreams || [];
      person.incomeStreams.push({
        id: Math.random().toString(36).slice(2, 10),
        name: '新收入',
        type: 'gross',
        monthlyAmount: 0,
        annualGrowth: 0.03,
        startYear: new Date().getFullYear(),
        endYear: null,
        ownerId: person.id,
      });
    });
  },

  removeIncomeStream: (streamId) => {
    get().updateActive(plan => {
      (plan.people || []).forEach((p: any) => {
        p.incomeStreams = (p.incomeStreams || []).filter((s: any) => s.id !== streamId);
      });
    });
  },

  addSpouse: () => {
    get().updateActive(plan => {
      if ((plan.people || []).length >= 2) return;
      const _y = new Date().getFullYear();
      const id = 'p' + (plan.people.length + 1);
      plan.people.push({
        id,
        name: '配偶',
        birthYear: _y - 30,
        retireYear: _y + 25,
        incomeStreams: [
          { id: Math.random().toString(36).slice(2, 10), name: '配偶工资', type: 'gross', monthlyAmount: 20000, annualGrowth: 0.03, startYear: _y, endYear: _y + 30, ownerId: id },
        ],
      });
    });
  },

  removeSpouse: (personId) => {
    get().updateActive(plan => {
      if ((plan.people || []).length <= 1) return;
      plan.people = plan.people.filter((p: any) => p.id !== personId);
    });
  },

  updatePerson: (id, mutate) => {
    get().updateActive(plan => {
      const p = (plan.people || []).find((x: any) => x.id === id);
      if (p) mutate(p);
    });
  },

  addExpenseCategory: () => {
    get().updateActive(plan => {
      plan.expenseCategories = plan.expenseCategories || [];
      plan.expenseCategories.push({
        id: Math.random().toString(36).slice(2, 10),
        name: '新类别',
        monthly: 0,
        inflationRate: plan.infl || 0.025,
      });
    });
  },

  removeExpenseCategory: (id) => {
    get().updateActive(plan => {
      plan.expenseCategories = (plan.expenseCategories || []).filter((c: any) => c.id !== id);
    });
  },

  updateExpenseCategory: (id, mutate) => {
    get().updateActive(plan => {
      const c = (plan.expenseCategories || []).find((x: any) => x.id === id);
      if (c) mutate(c);
    });
  },

  updateStage: (key, mutate) => {
    get().updateActive(plan => {
      plan.stages = plan.stages || {};
      plan.stages[key] = plan.stages[key] || {};
      mutate(plan.stages[key]);
    });
  },

  updatePension: (mutate) => {
    get().updateActive(plan => {
      plan.pension = plan.pension || {};
      mutate(plan.pension);
    });
  },

  addGoal: (preset) => {
    get().updateActive(plan => {
      plan.goals = plan.goals || [];
      plan.goals.push({
        id: Math.random().toString(36).slice(2, 10),
        name: preset?.name || '新目标',
        year: preset?.year ?? (new Date().getFullYear() + 5),
        amount: preset?.amount ?? 500000,
        priority: preset?.priority ?? 1,
      });
      plan.goals.sort((a: any, b: any) => a.year - b.year);
    });
  },

  removeGoal: (id) => {
    get().updateActive(plan => {
      plan.goals = (plan.goals || []).filter((g: any) => g.id !== id);
    });
  },

  toggleGoalDisabled: (id) => {
    get().updateActive(plan => {
      const g = (plan.goals || []).find((x: any) => x.id === id);
      if (g) g.disabled = !g.disabled;
    });
  },

  updateGoal: (id, mutate) => {
    get().updateActive(plan => {
      const g = (plan.goals || []).find((x: any) => x.id === id);
      if (g) mutate(g);
    });
  },

  addEvent: (preset) => {
    get().updateActive(plan => {
      plan.events = plan.events || [];
      plan.events.push({
        id: Math.random().toString(36).slice(2, 10),
        name: preset?.name || '新事件',
        year: preset?.year ?? (new Date().getFullYear() + 5),
        amount: preset?.amount ?? -100000,
        monthly: preset?.monthly ?? false,
        monthlyDelta: preset?.monthlyDelta ?? 0,
      });
      plan.events.sort((a: any, b: any) => a.year - b.year);
    });
  },

  saveEvent: (ev) => {
    get().updateActive(plan => {
      plan.events = plan.events || [];
      const idx = plan.events.findIndex((e: any) => e.id === ev.id);
      if (idx >= 0) plan.events[idx] = ev;
      else plan.events.push(ev);
      plan.events.sort((a: any, b: any) => a.year - b.year);
    });
  },

  removeEvent: (id) => {
    get().updateActive(plan => {
      plan.events = (plan.events || []).filter((e: any) => e.id !== id);
    });
  },

  addLiability: () => {
    get().updateActive(plan => {
      plan.liabilities = plan.liabilities || [];
      plan.liabilities.push({
        id: Math.random().toString(36).slice(2, 10),
        name: '新债务',
        principal: 1000000,
        rate: 0.04,
        years: 25,
        paymentType: 'equal',
        startYear: new Date().getFullYear(),
      });
    });
  },

  removeLiability: (id) => {
    get().updateActive(plan => {
      plan.liabilities = (plan.liabilities || []).filter((d: any) => d.id !== id);
    });
  },

  updateLiability: (id, mutate) => {
    get().updateActive(plan => {
      const d = (plan.liabilities || []).find((x: any) => x.id === id);
      if (d) mutate(d);
    });
  },

  duplicatePlan: () => {
    const state = get();
    const src = state.plans[state.activePlanId];
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = Math.random().toString(36).slice(2, 10);
    copy.name = src.name + ' 副本';
    set({ plans: { ...state.plans, [copy.id]: copy }, activePlanId: copy.id });
    get().save();
    get().rerun();
  },

  renamePlan: (newName) => {
    get().updateActive(plan => { plan.name = newName; });
  },

  deleteActivePlan: () => {
    const state = get();
    const ids = Object.keys(state.plans);
    if (ids.length <= 1) {
      alert('至少保留一个方案');
      return;
    }
    const { [state.activePlanId]: _, ...rest } = state.plans;
    const newActive = Object.keys(rest)[0];
    set({ plans: rest, activePlanId: newActive });
    get().save();
    get().rerun();
  },
}));
