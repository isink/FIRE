import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'FIRE Planner — 中国版财富自由规划器',
  description: '把"几岁能 FIRE"从估算变成数学：5 城市五险一金 / 7 级累进个税 / 夫妻独立退休 / IPA 60 岁解锁 / 房贷与社保精算。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${mono.variable}`}>
      <body className="font-sans bg-canvas text-text-1 antialiased">{children}</body>
    </html>
  );
}
