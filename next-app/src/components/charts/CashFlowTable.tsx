'use client';
import { usePlanStore } from '@/store/plan';
import { fmtCompact, fmtCompactSigned, _thisYear } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function CashFlowTable() {
 const sim = usePlanStore(s => s.sim);
 if (!sim || !sim.yearlyRows || sim.yearlyRows.length === 0) return null;

 const fireYear = sim.yearsToFire != null ? _thisYear + Math.ceil(sim.yearsToFire) : null;
 const hasDebt = sim.yearlyRows.some((r: any) => (r.debt || 0) > 0);

 return (
 <div className="rounded-lg bg-surface shadow-e1 ring-1 ring-border/60 overflow-hidden">
 <div className="px-5 py-3.5 border-b border-border flex items-baseline gap-2">
 <span className="text-md font-medium text-text-1 tracking-tight">逐年预测</span>
 <span className="text-sm text-text-3">P50 中位数路径</span>
 </div>
 <div className="max-h-[420px] overflow-y-auto">
 <Table>
 <TableHeader>
 <TableRow className="even:bg-transparent hover:bg-transparent">
 <TableHead className="bg-surface">年份</TableHead>
 <TableHead className="bg-surface text-right">年收入</TableHead>
 <TableHead className="bg-surface text-right">年支出</TableHead>
 {hasDebt && <TableHead className="bg-surface text-right">年偿债</TableHead>}
 <TableHead className="bg-surface text-right">年净储蓄</TableHead>
 <TableHead className="bg-surface text-right">投资组合 P50</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {sim.yearlyRows.map((row: any, i: number) => {
 const isFireYear = fireYear && row.year === fireYear;
 const isRetired = fireYear && row.year > fireYear;
 return (
 <TableRow
 key={i}
 className={cn(
 'relative',
 isFireYear && 'bg-primary/[0.05] even:bg-primary/[0.05] hover:bg-primary/[0.07]',
 isRetired && 'text-text-3'
 )}
 >
 <TableCell
 className={cn(
 'mono font-medium',
 isFireYear
 ? 'text-primary font-medium relative pl-3 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:bg-primary before:rounded-full'
 : isRetired ? 'text-text-3' : 'text-text-1'
 )}
 >
 {row.year}{isFireYear ? ' 🎯' : ''}
 </TableCell>
 <TableCell className={cn('mono text-right', isRetired ? 'text-text-3' : 'text-text-2')}>
 {row.income > 0 ? '¥' + fmtCompact(row.income) : '—'}
 </TableCell>
 <TableCell className={cn('mono text-right', isRetired ? 'text-text-3' : 'text-text-2')}>
 ¥{fmtCompact(row.expense)}
 </TableCell>
 {hasDebt && (
 <TableCell className={cn('mono text-right', (row.debt || 0) > 0 ? 'text-text-2' : 'text-text-3')}>
 {(row.debt || 0) > 0 ? '¥' + fmtCompact(row.debt) : '—'}
 </TableCell>
 )}
 {/* 红=盈/正, 绿=亏/负 */}
 <TableCell className={cn('mono text-right font-medium', row.netSavings >= 0 ? 'text-gain' : 'text-loss')}>
 {fmtCompactSigned(row.netSavings)}
 </TableCell>
 <TableCell className={cn('mono text-right font-medium', isRetired ? 'text-text-3' : 'text-text-1')}>
 ¥{fmtCompact(row.portfolioP50)}
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 </div>
 );
}
