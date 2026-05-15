/* storage.js — 云端方案同步层
 *
 * 策略：本地优先 + debounced push 到 supabase
 *   - 登录时 pullFromCloud() 把云端 payload 覆盖到 localStorage
 *   - app.js 的 saveStore() 内部触发 push（debounce 800ms）
 *   - 未配置 supabase 或未登录 → push/pull 是 no-op
 *
 * Schema（Supabase SQL editor 里运行一次）：
 *   create table public.plans (
 *     user_id uuid primary key references auth.users(id) on delete cascade,
 *     payload jsonb not null,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table public.plans enable row level security;
 *   create policy "own row" on public.plans
 *     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
 */
(function () {
  const STORAGE_KEY = 'fire-state-v5';  // app.js 主 store 键
  let pushTimer = null;
  let pulling = false;

  function supa() {
    return window.Auth && window.Auth.isConfigured() ? window.Auth._client() : null;
  }

  async function pullFromCloud() {
    if (pulling) return false;
    const client = supa();
    if (!client) return false;  // 未配置 supabase
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session?.user) return false;
      pulling = true;
      const { data, error } = await client
        .from('plans')
        .select('payload, updated_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      pulling = false;
      if (error) { console.warn('[cloud] pull error', error); return false; }
      if (data?.payload) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data.payload)); } catch {}
        return true;
      }
      return false;
    } catch (e) {
      pulling = false;
      console.warn('[cloud] pull exception', e);
      return false;
    }
  }

  function schedulePush() {
    const client = supa();
    if (!client) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 800);
  }

  async function pushNow() {
    const client = supa();
    if (!client) return;
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session?.user) return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      const { error } = await client
        .from('plans')
        .upsert({
          user_id: session.user.id,
          payload,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      if (error) console.warn('[cloud] push error', error);
      else _setSyncBadge('synced');
    } catch (e) {
      console.warn('[cloud] push exception', e);
    }
  }

  function _setSyncBadge(state) {
    const el = document.getElementById('syncBadge');
    if (!el) return;
    if (state === 'pending') {
      el.textContent = '☁ 同步中…';
      el.className   = 'sync-badge pending';
    } else if (state === 'synced') {
      el.textContent = '✓ 已同步';
      el.className   = 'sync-badge synced';
      setTimeout(() => { el.textContent = ''; el.className = 'sync-badge'; }, 2000);
    }
  }

  window.CloudStorage = {
    pullFromCloud,
    schedulePush,
    pushNow,
    isEnabled() { return !!supa(); },
    _setSyncBadge,
  };
})();
