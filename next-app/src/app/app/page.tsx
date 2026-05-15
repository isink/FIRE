'use client';
import { useState, useEffect } from 'react';
import { usePlanStore } from '@/store/plan';
import { Sidebar, type ViewKey } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { ParamsPanel } from '@/components/ParamsPanel';
import { Overview } from '@/components/views/Overview';
import { Household } from '@/components/views/Household';
import { Income } from '@/components/views/Income';
import { Expenses } from '@/components/views/Expenses';
import { Assets } from '@/components/views/Assets';
import { Debts } from '@/components/views/Debts';
import { Stages } from '@/components/views/Stages';
import { Goals } from '@/components/views/Goals';
import { Events } from '@/components/views/Events';

export default function AppPage() {
  const [view, setView] = useState<ViewKey>('overview');
  const init = usePlanStore(s => s.init);
  const ready = usePlanStore(s => s.ready);

  useEffect(() => {
    init();
  }, [init]);

  if (!ready) {
    return (
      <div className="h-screen grid place-items-center bg-canvas">
        <div className="text-text-3 text-base">加载中…</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-canvas grid" style={{ gridTemplateColumns: '240px 1fr 288px', gridTemplateRows: '56px 1fr' }}>
      <Sidebar active={view} onSelect={setView} />
      <Topbar activeView={view} />
      <main className="overflow-hidden bg-canvas">
        {view === 'overview'  && <Overview />}
        {view === 'household' && <Household />}
        {view === 'income'    && <Income />}
        {view === 'expenses'  && <Expenses />}
        {view === 'assets'    && <Assets />}
        {view === 'debts'     && <Debts />}
        {view === 'stages'    && <Stages />}
        {view === 'goals'     && <Goals />}
        {view === 'events'    && <Events />}
      </main>
      <ParamsPanel />
    </div>
  );
}
