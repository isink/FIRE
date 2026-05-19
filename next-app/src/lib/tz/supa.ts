import { createClient } from '@supabase/supabase-js';

// 公开匿名 client，仅用于 tz 落地页埋点/留资（只 insert）。
export const tzSupa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
);
