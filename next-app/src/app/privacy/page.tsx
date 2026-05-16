import Link from 'next/link';

export default function Privacy() {
 return (
 <div className="min-h-screen bg-white">
 <header className="bg-white border-b border-slate-200">
 <nav className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
 <Link href="/" className="flex items-center gap-2.5">
 <div className="w-8 h-8 bg-primary text-white font-medium rounded-md grid place-items-center text-sm">F</div>
 <span className="font-medium">FIRE Planner</span>
 </Link>
 <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">← 返回</Link>
 </nav>
 </header>
 <main className="max-w-3xl mx-auto px-6 py-12 prose prose-slate prose-sm">
 <h1>隐私政策</h1>
 <p className="text-slate-500 font-medium">最后更新：2026-05-15</p>
 <h2>1. 我们收集的信息</h2>
 <p>注册时仅收集邮箱与密码（密码经 Supabase Auth 加盐哈希存储）。使用时存储你在应用中输入的财务数据。</p>
 <h2>2. 我们不做的</h2>
 <ul>
 <li>不出售用户数据给任何第三方</li>
 <li>不向广告网络共享数据</li>
 <li>不在产品内嵌入第三方追踪脚本（无 GA / 无 Meta Pixel）</li>
 </ul>
 <h2>3. 数据存储与多租户隔离</h2>
 <p>Postgres 行级安全策略 (auth.uid() = user_id) 保证每个用户仅能访问自己的行。</p>
 <h2>4. 用户权利</h2>
 <p>可随时通过账号设置导出全部方案或删除账号。</p>
 </main>
 </div>
 );
}
