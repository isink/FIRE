'use client';
import { HeroMetrics } from '@/components/HeroMetrics';
import { MainChart } from '@/components/charts/MainChart';
import { Sankey } from '@/components/charts/Sankey';
import { WithdrawChart } from '@/components/charts/WithdrawChart';
import { CashFlowTable } from '@/components/charts/CashFlowTable';
import { Tornado } from '@/components/charts/Tornado';

export function Overview() {
  return (
    <div className="px-6 py-5 overflow-y-auto h-full">
      <HeroMetrics />
      <div className="space-y-6">
        <MainChart />
        <CashFlowTable />
        <Sankey />
        <WithdrawChart />
        <Tornado />
      </div>
    </div>
  );
}
