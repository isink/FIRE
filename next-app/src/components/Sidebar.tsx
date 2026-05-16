'use client';
import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, ArrowRightLeft, ListTree, PiggyBank, Home,
  Milestone, Target, Calendar
} from 'lucide-react';

export type ViewKey =
  | 'overview' | 'household' | 'income' | 'expenses' | 'assets'
  | 'debts' | 'stages' | 'goals' | 'events';

const NAV_GROUPS: Array<{ title: string; items: Array<{ key: ViewKey; label: string; Icon: any }> }> = [
  {
    title: '主菜单',
    items: [
      { key: 'overview',  label: '总览', Icon: LayoutDashboard },
      { key: 'household', label: '家庭', Icon: Users },
      { key: 'income',    label: '收入', Icon: ArrowRightLeft },
      { key: 'expenses',  label: '支出', Icon: ListTree },
      { key: 'assets',    label: '资产', Icon: PiggyBank },
      { key: 'debts',     label: '债务', Icon: Home },
    ],
  },
  {
    title: '规划',
    items: [
      { key: 'stages', label: '阶段', Icon: Milestone },
      { key: 'goals',  label: '目标', Icon: Target },
      { key: 'events', label: '事件', Icon: Calendar },
    ],
  },
];

export const VIEW_LABELS: Record<ViewKey, string> = {
  overview: '总览', household: '家庭', income: '收入', expenses: '支出',
  assets: '资产', debts: '债务', stages: '阶段', goals: '目标', events: '事件',
};

export function Sidebar({ active, onSelect }: { active: ViewKey; onSelect: (k: ViewKey) => void }) {
  return (
    <nav className="row-span-2 flex flex-col py-4 overflow-y-auto bg-[hsl(222_47%_9%)]">
      <Link href="/" className="flex items-center gap-2.5 px-5 mb-6 group">
        <div className="w-8 h-8 bg-primary text-primary-foreground font-medium rounded-md grid place-items-center text-base transition-transform duration-fast ease-standard group-hover:scale-[1.04]">F</div>
        <span className="text-white font-medium tracking-tight text-md">FIRE Planner</span>
      </Link>

      {NAV_GROUPS.map(group => (
        <div key={group.title} className="mb-1">
          <div className="px-5 mb-1.5 mt-3 text-sm text-white/45 font-medium">{group.title}</div>
          {group.items.map(item => {
            const Icon = item.Icon;
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                className={cn(
                  'relative flex items-center gap-3 w-full pl-5 pr-3 py-2 text-base text-left transition-colors duration-fast ease-standard',
                  'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:transition-colors before:duration-fast',
                  isActive
                    ? 'bg-white/[0.06] text-white font-medium before:bg-primary'
                    : 'text-white/55 hover:text-white hover:bg-white/[0.03] before:bg-transparent'
                )}
              >
                <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={isActive ? 2 : 1.75} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}

      <div className="flex-1" />
      <div className="px-5 pt-4 mt-2 border-t border-white/[0.08] text-sm">
        <span className="text-white/50">本地模式</span>
      </div>
    </nav>
  );
}
