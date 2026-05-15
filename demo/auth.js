/* auth.js — 统一认证层
 *
 * 提供 window.Auth 接口：
 *   Auth.isConfigured()     → bool          (Supabase 凭证是否配好)
 *   Auth.getSession()       → session|null
 *   Auth.signUp(email, pw)  → Promise<session>
 *   Auth.signIn(email, pw)  → Promise<session>
 *   Auth.signOut()          → Promise<void>
 *   Auth.onAuthChange(cb)   → unsubscribe
 *
 * 未配置 Supabase 时自动 fallback 到 mock 实现（localStorage 存假 session），
 * 任何邮箱密码均可登录。用于演示 / 早期开发。
 */
(function () {
  const SESSION_KEY = 'fire-session';
  const CFG = window.SUPABASE_CONFIG || {};
  const useReal = !!(CFG.url && CFG.anonKey);

  // ── Supabase 真实模式 ──
  let supa = null;
  if (useReal && window.supabase) {
    try {
      supa = window.supabase.createClient(CFG.url, CFG.anonKey);
    } catch (e) {
      console.warn('[Auth] Supabase client init failed, falling back to mock', e);
    }
  }

  // ── Mock helpers ──
  function mockGetSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function mockSetSession(session) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  }
  function mockClearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  }
  function mockBuildSession(email) {
    return {
      user: { email, id: 'mock-' + btoa(email).slice(0, 12) },
      access_token: 'mock-token',
      mock: true,
      createdAt: Date.now(),
    };
  }

  // ── 公共接口 ──
  const Auth = {
    isConfigured() { return !!supa; },

    mode() { return supa ? 'supabase' : 'mock'; },

    async getSession() {
      if (supa) {
        const { data, error } = await supa.auth.getSession();
        if (error) throw error;
        return data.session;
      }
      return mockGetSession();
    },

    async signUp(email, password) {
      if (supa) {
        const { data, error } = await supa.auth.signUp({ email, password });
        if (error) throw error;
        return data.session;
      }
      const s = mockBuildSession(email);
      mockSetSession(s);
      return s;
    },

    async signIn(email, password) {
      if (supa) {
        const { data, error } = await supa.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.session;
      }
      const s = mockBuildSession(email);
      mockSetSession(s);
      return s;
    },

    async signOut() {
      if (supa) {
        const { error } = await supa.auth.signOut();
        if (error) throw error;
        return;
      }
      mockClearSession();
    },

    onAuthChange(cb) {
      if (supa) {
        const { data } = supa.auth.onAuthStateChange((event, session) => cb(session, event));
        return () => data.subscription.unsubscribe();
      }
      // mock 无外部事件源；返回空 unsubscribe
      return () => {};
    },

    // 暴露底层 supa client 给 storage 层（Phase 22）使用
    _client() { return supa; },
  };

  window.Auth = Auth;
})();
