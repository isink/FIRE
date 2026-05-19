import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, BarChart3, Users, Home, Landmark, TrendingUp, Target, Check } from 'lucide-react';

const FEATURES = [
 { Icon: Landmark, title: '个税精算', desc: '5 城市五险一金 + 7 级累进个税 + 7 项专项附加扣除。税前月薪输入，自动算到实发，边际税档跟着收入走。' },
 { Icon: Users, title: '夫妻建模', desc: '双方独立的出生年、退休年、收入流。家庭退休 = 最后退休那个人。社保按各自 60 岁分别触发。' },
 { Icon: Home, title: '房产 / 资产桶', desc: '自住 vs 出租，物业费 + 租金 + 升值率独立建模。资产分 现金 / 应税 / IPA / 房产 四桶，退休按顺序取款。' },
 { Icon: TrendingUp, title: '社保精算', desc: '基础养老金 (社平 × 缴费指数 × 年限) + 个人账户，60 岁触发。配合医疗缺口建模退休后真实开销。' },
 { Icon: BarChart3, title: '14 种可视化', desc: '净值堆叠面积图、桑基现金流图、退休期取款来源、敏感性 tornado、对比方案表、年度现金流逐年表。' },
 { Icon: Target, title: '多目标 + 可持续性', desc: '买房 / 教育金 / 留学等独立目标，自动算每个目标推迟 FIRE 几年。Guyton-Klinger 动态提取保护极端市场。' },
];

const PRICING = [
 { name: '免费', price: '¥0', period: '永久', features: ['最多 3 个方案', '14 个分析维度全开', '夫妻建模', '本地 + 云端同步', 'JSON 导入导出'], cta: '免费注册', featured: false },
 { name: '专业版', price: '¥29', period: '/ 月', features: ['无限方案', '实时行情自动刷新', 'PDF 报告导出', '历史压力场景库', '优先邮件支持'], cta: '14 天免费试用', featured: true, badge: '推荐', note: '早期用户限时 ¥19/月' },
 { name: '家庭', price: '¥49', period: '/ 月', features: ['专业版全部', '多用户共享（≤ 4 人）', '共享方案 + 协作编辑', '子女教育金独立追踪', '财务顾问咨询'], cta: '即将上线', featured: false },
];

export default function LandingPage() {
 return (
 <div className="min-h-screen bg-surface text-text-1">
 {/* Nav */}
 <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-md border-b border-border">
 <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
 <Link href="/" className="flex items-center gap-2.5">
 <div className="w-7 h-7 bg-primary text-primary-foreground font-medium rounded-md grid place-items-center text-sm">F</div>
 <span className="font-medium tracking-tight">FIRE Planner</span>
 </Link>
 <div className="hidden md:flex items-center gap-8 text-base text-text-2">
 <a href="#features" className="hover:text-text-1 transition-colors duration-fast">功能</a>
 <a href="#pricing" className="hover:text-text-1 transition-colors duration-fast">定价</a>
 <Link href="/app" className="hover:text-text-1 transition-colors duration-fast">在线试用</Link>
 </div>
 <div className="flex items-center gap-2">
 <Link href="/app">
 <Button variant="ghost" size="sm">登录</Button>
 </Link>
 <Link href="/app">
 <Button variant="primary" size="sm">免费注册 <ArrowRight className="w-3.5 h-3.5" /></Button>
 </Link>
 </div>
 </nav>
 </header>

 {/* Hero */}
 <section className="relative">
 <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-24">
 <div className="grid lg:grid-cols-2 lg:items-center gap-12 lg:gap-10">
 {/* 左:文案 */}
 <div className="max-w-xl">
 <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-primary border border-primary/25 bg-primary/[0.05] mb-7">
 14 个分析维度全部用中国规则建模
 </div>
 <h1 className="text-hero sm:text-[3rem] font-medium tracking-tight leading-[1.15] text-text-1">
 算清楚你<span className="text-primary">几岁</span>能 FIRE
 </h1>
 <p className="mt-6 text-lg leading-relaxed text-text-2">
 把 ProjectionLab 的全套建模能力，用中国规则重做一遍。五险一金、个税专项扣除、夫妻独立退休、个人养老金 60 岁锁定、房贷拖累、社保精算——5,000 次蒙特卡洛 / 2 秒内输出。
 </p>
 <div className="mt-9 flex flex-col sm:flex-row gap-3">
 <Link href="/app">
 <Button variant="primary" size="lg" className="gap-2">
 立即试用（无需注册）
 <ArrowRight className="w-4 h-4" />
 </Button>
 </Link>
 <Link href="/app">
 <Button variant="outline" size="lg">注册保存方案</Button>
 </Link>
 </div>
 <p className="mt-6 text-sm text-text-3 mono">数据本地优先 · 端到端加密 · 不向任何第三方共享</p>
 </div>

 {/* 右:插图 — 克制的财富轨迹曲线(无阴影/无炫色) */}
 <div className="hidden lg:block">
 <svg viewBox="0 0 460 360" className="w-full h-auto" role="img" aria-label="财富增长轨迹示意">
 <defs>
 <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.14" />
 <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0" />
 </linearGradient>
 </defs>
 {/* 网格 */}
 {[0, 1, 2, 3, 4].map(i => (
 <line key={i} x1="40" x2="430" y1={60 + i * 60} y2={60 + i * 60}
 stroke="hsl(var(--border-hairline))" strokeWidth="1" />
 ))}
 {/* 目标线(虚线) */}
 <line x1="40" x2="430" y1="90" y2="90" stroke="hsl(var(--brand))" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.55" />
 <text x="430" y="84" textAnchor="end" fontSize="12" fill="hsl(var(--text-3))">目标 1000 万</text>
 {/* P50 面积 + 曲线 */}
 <path d="M40 300 C 120 290, 170 250, 220 210 C 270 170, 320 120, 430 70 L 430 300 Z" fill="url(#heroFill)" />
 <path d="M40 300 C 120 290, 170 250, 220 210 C 270 170, 320 120, 430 70"
 fill="none" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinecap="round" />
 {/* P10/P90 浅带 */}
 <path d="M40 312 C 130 300, 190 270, 250 235 C 320 195, 370 150, 430 110"
 fill="none" stroke="hsl(var(--border-strong))" strokeWidth="1.5" opacity="0.7" />
 {/* FIRE 触点 */}
 <circle cx="350" cy="98" r="5" fill="hsl(var(--brand))" />
 <text x="350" y="135" textAnchor="middle" fontSize="13" fill="hsl(var(--text-2))" className="font-medium">FIRE · 2048</text>
 {/* 轴标 */}
 <text x="40" y="330" fontSize="12" fill="hsl(var(--text-3))">今年</text>
 <text x="430" y="330" textAnchor="end" fontSize="12" fill="hsl(var(--text-3))">退休</text>
 </svg>
 </div>
 </div>

 {/* App preview — 单色克制, 非彩虹 */}
 <div className="mt-16 max-w-4xl mx-auto">
 <div className="rounded-xl bg-surface ring-1 ring-border shadow-e3 overflow-hidden">
 <div className="flex items-center gap-1.5 bg-surface-sunken border-b border-border px-4 py-2.5">
 <div className="w-2.5 h-2.5 rounded-full bg-border-strong"></div>
 <div className="w-2.5 h-2.5 rounded-full bg-border-strong"></div>
 <div className="w-2.5 h-2.5 rounded-full bg-border-strong"></div>
 <div className="ml-3 text-sm text-text-3 mono">fire-planner / 总览</div>
 </div>
 <div className="p-6">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
 {[
 { k: 'FIRE 预计达成', v: '2043', s: '17.5 年后', accent: true },
 { k: '达成概率', v: '92.9%', s: '退休可持续 100%' },
 { k: '储蓄率', v: '48%', s: '税后口径' },
 { k: 'Coast FIRE', v: '2036', s: '10.75 年后可停投' },
 ].map((m, i) => (
 <div key={i} className={'rounded-md p-3 ring-1 ' + (m.accent ? 'bg-primary/[0.04] ring-primary/25' : 'bg-surface-sunken ring-border/60')}>
 <div className={'text-xs ' + (m.accent ? 'text-primary' : 'text-text-3')}>{m.k}</div>
 <div className={'text-2xl font-medium mono mt-1 ' + (m.accent ? 'text-primary' : 'text-text-1')}>{m.v}</div>
 <div className="text-xs text-text-3 mt-0.5">{m.s}</div>
 </div>
 ))}
 </div>
 <div className="h-48 bg-surface-sunken/50 rounded-md ring-1 ring-border/60 flex items-end p-4 gap-1">
 {[18, 22, 28, 34, 42, 50, 58, 64, 72, 78, 84, 88, 92, 95, 98].map((h, i) => (
 <div
 key={i}
 className={'flex-1 rounded-sm ' + (i < 5 ? 'bg-chart-1' : i < 9 ? 'bg-chart-2' : i < 12 ? 'bg-chart-3' : 'bg-chart-4')}
 style={{ height: `${h}%` }}
 ></div>
 ))}
 </div>
 </div>
 </div>
 </div>
 </div>
 </section>

 {/* Features */}
 <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
 <div className="max-w-3xl mx-auto text-center mb-14">
 <h2 className="text-sm font-medium text-primary">能力</h2>
 <p className="mt-3 text-2xl font-medium tracking-tight text-text-1">这是规划器，不是计算器</p>
 <p className="mt-5 text-lg text-text-2 leading-relaxed">市面上的 FIRE 计算器只会算&ldquo;按 7% 复利&rdquo;。真实场景里你得算个税、五险一金、买房、生娃、配偶收入、医疗通胀、社保领取、IPA 60 岁解锁。</p>
 </div>
 <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
 {FEATURES.map((f, i) => {
 const Icon = f.Icon;
 return (
 <div key={i} className="rounded-lg bg-surface ring-1 ring-border p-5 hover:ring-border-strong hover:shadow-e1 transition-all duration-fast">
 <div className="w-9 h-9 rounded-md bg-surface-sunken grid place-items-center mb-4">
 <Icon className="w-[18px] h-[18px] text-text-2" strokeWidth={1.75} />
 </div>
 <h3 className="text-md font-medium mb-1.5 text-text-1">{f.title}</h3>
 <p className="text-base text-text-3 leading-relaxed">{f.desc}</p>
 </div>
 );
 })}
 </div>
 </section>

 {/* Pricing */}
 <section id="pricing" className="bg-canvas border-y border-border">
 <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
 <div className="max-w-3xl mx-auto text-center mb-14">
 <h2 className="text-sm font-medium text-primary">定价</h2>
 <p className="mt-3 text-2xl font-medium tracking-tight text-text-1">早期用户全部免费</p>
 <p className="mt-5 text-lg text-text-2 leading-relaxed">建模能力本身不分付费档。付费版差异是并发量与协作。</p>
 </div>
 <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
 {PRICING.map((p, i) => (
 <div key={i} className={'relative rounded-xl bg-surface p-7 flex flex-col ' + (p.featured ? 'ring-2 ring-primary shadow-e2' : 'ring-1 ring-border')}>
 {p.badge && (
 <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">{p.badge}</div>
 )}
 <h3 className="text-md font-medium text-text-1">{p.name}</h3>
 <p className="mt-4 flex items-baseline">
 <span className="text-2xl font-medium tracking-tight mono text-text-1">{p.price}</span>
 <span className="text-sm text-text-3 ml-1.5">{p.period}</span>
 </p>
 {p.note && <p className="text-sm text-primary mt-1 font-medium">{p.note}</p>}
 <ul className="mt-6 space-y-2.5 text-base text-text-2 flex-1">
 {p.features.map((f, j) => (
 <li key={j} className="flex gap-2.5"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" strokeWidth={2.25} />{f}</li>
 ))}
 </ul>
 <Link href="/app" className="mt-7 block">
 <Button variant={p.featured ? 'primary' : 'outline'} className="w-full">{p.cta}</Button>
 </Link>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* Footer */}
 <footer className="border-t border-border bg-surface">
 <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
 <div className="flex flex-col md:flex-row justify-between items-start gap-6">
 <div>
 <div className="flex items-center gap-2.5 mb-3">
 <div className="w-7 h-7 bg-primary text-primary-foreground font-medium rounded-md grid place-items-center text-sm">F</div>
 <span className="font-medium tracking-tight">FIRE Planner</span>
 </div>
 <p className="text-base text-text-3 max-w-sm leading-relaxed">中国版财富自由规划器。把&ldquo;几岁能 FIRE&rdquo;从估算变成数学。</p>
 </div>
 <div className="flex gap-12 text-base text-text-3">
 <div className="space-y-2">
 <div className="font-medium text-text-1">产品</div>
 <a href="#features" className="block hover:text-text-1 transition-colors duration-fast">功能</a>
 <a href="#pricing" className="block hover:text-text-1 transition-colors duration-fast">定价</a>
 <Link href="/app" className="block hover:text-text-1 transition-colors duration-fast">在线试用</Link>
 </div>
 <div className="space-y-2">
 <div className="font-medium text-text-1">法律</div>
 <Link href="/privacy" className="block hover:text-text-1 transition-colors duration-fast">隐私政策</Link>
 <Link href="/terms" className="block hover:text-text-1 transition-colors duration-fast">服务条款</Link>
 <a href="mailto:support@example.com" className="block hover:text-text-1 transition-colors duration-fast">联系</a>
 </div>
 </div>
 </div>
 <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row justify-between gap-2 text-sm text-text-3">
 <span>© 2026 FIRE Planner. All rights reserved.</span>
 <span className="mono">仅供参考 · 不构成投资建议</span>
 </div>
 </div>
 </footer>
 </div>
 );
}
