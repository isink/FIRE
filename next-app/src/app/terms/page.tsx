import Link from 'next/link';

export default function Terms() {
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
 <h1>服务条款</h1>
 <p className="text-slate-500 font-medium">最后更新：2026-05-15</p>
 <div className="not-prose bg-primary-50 border-l-4 border-primary p-4 my-6 rounded-r-lg">
 <strong className="text-primary-800">重要免责</strong>
 <p className="mt-2 text-sm">本服务提供的所有数字均为基于历史数据 + 蒙特卡洛模拟的<strong>估算</strong>，<strong>不构成任何投资建议</strong>。重大财务决策请咨询持牌财务顾问。</p>
 </div>
 <h2>1. 服务定义</h2>
 <p>FIRE Planner 是个人财务规划工具。我们不提供资产托管、不撮合交易。</p>
 <h2>2. 账户责任</h2>
 <ul>
 <li>你必须年满 18 岁才能注册</li>
 <li>你对账户密码安全负完全责任</li>
 </ul>
 <h2>3. 责任限制</h2>
 <p>按&ldquo;现状&rdquo;提供，不对基于模拟数据做出的财务决策造成的损失负责。</p>
 <h2>4. 适用法律</h2>
 <p>本条款受中华人民共和国法律管辖。</p>
 </main>
 </div>
 );
}
