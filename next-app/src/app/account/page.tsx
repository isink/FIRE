'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function Account() {
 return (
 <div className="min-h-screen bg-slate-50">
 <header className="bg-white border-b border-slate-200">
 <nav className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
 <Link href="/" className="flex items-center gap-2.5">
 <div className="w-8 h-8 bg-primary text-white font-medium rounded-md grid place-items-center text-sm">F</div>
 <span className="font-medium">FIRE Planner</span>
 </Link>
 <Link href="/app" className="text-sm text-slate-600 hover:text-slate-900">← 返回应用</Link>
 </nav>
 </header>
 <main className="max-w-3xl mx-auto px-6 py-12">
 <h1 className="text-3xl font-medium mb-2">账号设置</h1>
 <p className="text-slate-600 mb-10">管理你的账户信息、订阅、数据。</p>

 <Card className="mb-4">
 <CardContent className="pt-6 pb-6">
 <h2 className="text-lg font-medium mb-4">基本信息</h2>
 <div className="divide-y divide-slate-200">
 <div className="flex justify-between py-3 text-sm">
 <span className="text-slate-600">邮箱</span>
 <span className="font-mono">演示模式（未登录）</span>
 </div>
 <div className="flex justify-between py-3 text-sm">
 <span className="text-slate-600">当前订阅</span>
 <span className="inline-flex items-center gap-2">
 <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">免费版</span>
 <Button size="sm" variant="outline" onClick={() => alert('升级专业版即将上线')}>升级 →</Button>
 </span>
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="mb-4">
 <CardContent className="pt-6 pb-6">
 <h2 className="text-lg font-medium mb-2">数据管理</h2>
 <p className="text-sm text-slate-600 mb-4">方案数据保存在浏览器 localStorage。Phase 33 接入云端同步后会同时存到 Supabase。</p>
 <div className="flex flex-wrap gap-2">
 <Button variant="outline" onClick={() => {
 const raw = localStorage.getItem('fire-state-v15');
 if (!raw) { alert('暂无方案数据'); return; }
 const blob = new Blob([raw], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = 'fire-plans-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '.json';
 document.body.appendChild(a); a.click(); document.body.removeChild(a);
 URL.revokeObjectURL(url);
 }}>⬇ 导出方案 (JSON)</Button>
 </div>
 </CardContent>
 </Card>
 </main>
 </div>
 );
}
