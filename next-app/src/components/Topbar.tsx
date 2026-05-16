'use client';
import { usePlanStore } from '@/store/plan';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
 Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
 DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown';
import { MoreVertical, RefreshCw, Pencil, Copy, Trash2, Download, Upload, Printer, LogOut, User as UserIcon, Crown, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ViewKey } from './Sidebar';
import { VIEW_LABELS } from './Sidebar';

export function Topbar({ activeView }: { activeView: ViewKey }) {
 const router = useRouter();
 const plans = usePlanStore(s => s.plans);
 const activeId = usePlanStore(s => s.activePlanId);
 const compareMode = usePlanStore(s => s.compareMode);
 const setActive = usePlanStore(s => s.setActive);
 const toggleCompare = usePlanStore(s => s.toggleCompare);
 const duplicatePlan = usePlanStore(s => s.duplicatePlan);
 const renamePlan = usePlanStore(s => s.renamePlan);
 const deleteActivePlan = usePlanStore(s => s.deleteActivePlan);
 const importState = usePlanStore(s => s.importState);

 const onRename = () => {
 const cur = plans[activeId];
 if (!cur) return;
 const n = prompt('方案新名称', cur.name);
 if (n && n.trim()) renamePlan(n.trim());
 };

 const onExport = () => {
 const payload = JSON.stringify({ schemaVersion: 16, exportedAt: new Date().toISOString(), store: { plans, activePlanId: activeId } }, null, 2);
 const blob = new Blob([payload], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `fire-plans-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
 document.body.appendChild(a); a.click(); document.body.removeChild(a);
 URL.revokeObjectURL(url);
 };

 const onImport = () => {
 const input = document.createElement('input');
 input.type = 'file';
 input.accept = 'application/json,.json';
 input.onchange = () => {
 const file = input.files?.[0];
 if (!file) return;
 const reader = new FileReader();
 reader.onload = () => {
 try {
 const parsed = JSON.parse(String(reader.result));
 // 兼容导出格式 {store:{plans,activePlanId}} 与裸 {plans,activePlanId}
 const src = parsed.store ?? parsed;
 const nextPlans = src.plans;
 const nextActive = src.activePlanId ?? Object.keys(nextPlans || {})[0];
 if (!nextPlans || !nextActive || !nextPlans[nextActive]) {
 alert('JSON 格式无效：需含 store.plans 与 store.activePlanId');
 return;
 }
 importState(nextPlans, nextActive);
 } catch {
 alert('JSON 解析失败：文件不是有效的方案导出');
 }
 };
 reader.readAsText(file);
 };
 input.click();
 };
 const onPrint = () => window.print();

 const iconActions = [
 { Icon: Pencil, label: '重命名', onClick: onRename },
 { Icon: Copy, label: '复制方案', onClick: duplicatePlan },
 { Icon: Trash2, label: '删除方案', onClick: deleteActivePlan, danger: true },
 ];

 return (
 <TooltipProvider delayDuration={200}>
 <header className="col-span-2 bg-surface border-b border-border flex items-center justify-between px-5 gap-4">
 <div className="flex items-center gap-3 min-w-0">
 <h1 className="text-lg font-medium text-text-1 tracking-tight whitespace-nowrap">
 {VIEW_LABELS[activeView] || activeView}
 </h1>
 <span className="w-px h-4 bg-border"></span>
 <div className="flex items-center gap-1">
 <Select value={activeId} onValueChange={setActive}>
 <SelectTrigger className="max-w-[180px]">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.values(plans).map((p: any) => (
 <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 <div className="flex items-center">
 {iconActions.map(({ Icon, label, onClick, danger }) => (
 <Tooltip key={label}>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="icon-sm"
 onClick={onClick}
 className={danger ? 'hover:text-destructive hover:bg-destructive/10' : ''}
 >
 <Icon className="w-3.5 h-3.5" />
 </Button>
 </TooltipTrigger>
 <TooltipContent>{label}</TooltipContent>
 </Tooltip>
 ))}
 </div>
 </div>
 </div>

 <div className="flex items-center gap-3">
 <label className="inline-flex items-center gap-2 text-base text-text-2 cursor-pointer select-none">
 <Switch checked={compareMode} onCheckedChange={toggleCompare} />
 <span>对比模式</span>
 </label>

 <DropdownMenu>
 <Tooltip>
 <TooltipTrigger asChild>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="icon-sm" aria-label="更多操作">
 <MoreVertical className="w-4 h-4" />
 </Button>
 </DropdownMenuTrigger>
 </TooltipTrigger>
 <TooltipContent>更多操作</TooltipContent>
 </Tooltip>
 <DropdownMenuContent align="end">
 <DropdownMenuItem onClick={onExport}><Download /> 导出 JSON</DropdownMenuItem>
 <DropdownMenuItem onClick={onImport}><Upload /> 导入 JSON</DropdownMenuItem>
 <DropdownMenuItem onClick={onPrint}><Printer /> 打印报告</DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>

 <Button variant="primary" size="sm" onClick={() => alert('刷新行情：连接 demo backend')}>
 <RefreshCw className="w-3.5 h-3.5" /> 刷新行情
 </Button>

 <span className="w-px h-5 bg-border"></span>

 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <button className="inline-flex items-center gap-2 text-base text-text-2 hover:bg-surface-sunken px-1.5 py-1 rounded-md transition-colors duration-fast">
 <span className="inline-flex items-center justify-center w-6 h-6 bg-surface-sunken text-text-2 rounded-full text-sm font-medium">?</span>
 <span className="max-w-[80px] truncate font-medium">访客</span>
 </button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-56">
 <div className="px-2.5 py-2 mb-1 border-b border-border">
 <div className="text-base font-medium text-text-1 truncate">演示模式</div>
 <div className="text-sm text-text-3 mt-0.5">免费版</div>
 </div>
 <DropdownMenuItem onClick={() => router.push('/')}><Home />营销首页</DropdownMenuItem>
 <DropdownMenuItem onClick={() => router.push('/account')}><UserIcon />账号设置</DropdownMenuItem>
 <DropdownMenuItem onClick={() => alert('升级专业版即将上线')}><Crown />升级专业版</DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuItem variant="danger" onClick={() => router.push('/')}><LogOut />登出</DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </header>
 </TooltipProvider>
 );
}
