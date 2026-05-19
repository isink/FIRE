import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/tz/supa', () => ({
  tzSupa: { from: () => ({ insert: insertMock }) },
}));

import { track } from '@/lib/tz/track';

describe('track', () => {
  beforeEach(() => insertMock.mockClear());

  it('写入 tz_events，含 session 与 event', async () => {
    await track('page_view', 'sess-1', { from: 'xhs' });
    expect(insertMock).toHaveBeenCalledWith({
      session_id: 'sess-1', event: 'page_view', payload: { from: 'xhs' },
    });
  });

  it('插入报错不抛出（埋点不可阻断主流程）', async () => {
    insertMock.mockResolvedValueOnce({ error: new Error('x') });
    await expect(track('cta_click', 's', {})).resolves.toBeUndefined();
  });
});
