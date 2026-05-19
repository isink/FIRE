import { describe, it, expect, vi, beforeEach } from 'vitest';

const { insertMock, getTzSupaMock } = vi.hoisted(() => {
  const insertMock = vi.fn().mockResolvedValue({ error: null });
  const getTzSupaMock = vi.fn(() => ({ from: () => ({ insert: insertMock }) }));
  return { insertMock, getTzSupaMock };
});

vi.mock('@/lib/tz/supa', () => ({ getTzSupa: getTzSupaMock }));

import { track } from '@/lib/tz/track';

describe('track', () => {
  beforeEach(() => {
    insertMock.mockClear();
    getTzSupaMock.mockClear();
    getTzSupaMock.mockImplementation(() => ({ from: () => ({ insert: insertMock }) }));
  });

  it('写入 tz_events，含 session 与 event', async () => {
    await track('page_view', 'sess-1', { from: 'xhs' });
    expect(insertMock).toHaveBeenCalledWith({ session_id: 'sess-1', event: 'page_view', payload: { from: 'xhs' } });
  });

  it('insert 报错不抛出', async () => {
    insertMock.mockResolvedValueOnce({ error: new Error('x') });
    await expect(track('cta_click', 's', {})).resolves.toBeUndefined();
  });

  it('client 构造失败(缺 env)也不抛出', async () => {
    getTzSupaMock.mockImplementationOnce(() => { throw new Error('supabaseUrl is required.'); });
    await expect(track('page_view', 's', {})).resolves.toBeUndefined();
  });
});
