import { tzSupa } from '@/lib/tz/supa';

export type TzEvent = 'page_view' | 'calc_done' | 'cta_click' | 'lead_submit';

// 埋点绝不可阻断或抛出，失败静默吞掉。
export async function track(event: TzEvent, sessionId: string, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    await tzSupa.from('tz_events').insert({ session_id: sessionId, event, payload });
  } catch {
    /* swallow */
  }
}
