'use client';
import { useState } from 'react';
import { getTzSupa } from '@/lib/tz/supa';
import { track } from '@/lib/tz/track';

export default function TzInterest() {
  const [contact, setContact] = useState('');
  const [done, setDone] = useState(false);
  const session = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('s') || 'unknown' : 'ssr';

  const submit = async () => {
    if (!contact.trim()) return;
    // 数据写入绝不可阻断 UX：getTzSupa() 缺 env 会抛，insert 也可能失败，全部吞掉。
    try {
      await getTzSupa().from('tz_leads').insert({ session_id: session, contact: contact.trim(), channel: 'tz' });
    } catch {
      /* swallow — lead 丢失可接受，funnel 的 lead_submit 事件才是主信号 */
    }
    await track('lead_submit', session, {});
    setDone(true);
  };

  return (
    <main className="max-w-md mx-auto px-4 py-12 text-center">
      {done ? (
        <>
          <h1 className="text-xl font-bold">已记下，方案上线第一时间发你</h1>
          <p className="mt-3 text-sm text-neutral-500">早鸟价 ¥19（首发名额），感谢支持。</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">体制内专属 FIRE 方案 · 内测中</h1>
          <p className="mt-3 text-sm text-neutral-600">
            含职业年金/公积金精算、提前退休亏损测算、3 套方案对比。
            留下微信或邮箱，上线第一时间发你 —— 早鸟 ¥19。
          </p>
          <input value={contact} onChange={e => setContact(e.target.value)}
            placeholder="微信号 / 邮箱"
            className="w-full mt-5 border rounded-lg px-3 py-3 text-center" />
          <button onClick={submit}
            className="w-full mt-3 bg-red-700 text-white rounded-lg py-3 font-medium">
            预约早鸟
          </button>
          <p className="mt-3 text-xs text-neutral-400">不会群发骚扰，仅用于通知上线。</p>
        </>
      )}
    </main>
  );
}
