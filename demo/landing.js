/* landing.js — Marketing 首页交互 + auth modal (Phase 20 mock 版) */

// 会话状态键（Phase 21 接 Supabase 后将由 SDK 管理）
const SESSION_KEY = 'fire-session';

let _authMode = 'login';  // 'login' | 'signup'

function openAuthModal(mode) {
  _authMode = mode || 'login';
  applyAuthMode();
  // Legacy: 旧的 backdrop-based modal（容错）
  document.getElementById('authModalBackdrop')?.classList.add('open');
  setTimeout(() => document.getElementById('authEmail')?.focus(), 100);
}

function closeAuthModal() {
  document.getElementById('authModalBackdrop')?.classList.remove('open');
  const err = document.getElementById('authError');
  if (err) err.style.display = 'none';
}

function switchAuthMode() {
  _authMode = (_authMode === 'login') ? 'signup' : 'login';
  applyAuthMode();
}

function applyAuthMode() {
  const isSignup = _authMode === 'signup';
  document.getElementById('authModalTitle').textContent  = isSignup ? '免费注册' : '登录';
  document.getElementById('authSubmitBtn').textContent   = isSignup ? '创建账号' : '登录';
  document.getElementById('authSwitchPrompt').textContent= isSignup ? '已有账号？' : '还没账号？';
  document.getElementById('authSwitchLink').textContent  = isSignup ? '登录' : '免费注册';
  const pwInp = document.getElementById('authPassword');
  pwInp.autocomplete = isSignup ? 'new-password' : 'current-password';
}

async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submitBtn = document.getElementById('authSubmitBtn');

  if (!email || !email.includes('@')) {
    showAuthError('请输入有效邮箱');
    return;
  }
  if (!password || password.length < 8) {
    showAuthError('密码至少 8 位');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '处理中…';

  try {
    if (_authMode === 'signup') {
      await window.Auth.signUp(email, password);
    } else {
      await window.Auth.signIn(email, password);
    }
    // 登录成功 → 跳应用
    window.location.href = '/app';
  } catch (err) {
    showAuthError(err?.message || '认证失败，请重试');
    submitBtn.disabled = false;
    submitBtn.textContent = _authMode === 'signup' ? '创建账号' : '登录';
  }
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = '';
}

function tryDemo() {
  // 演示模式：不登录、不存 session、直接进 /app（保持原 demo 行为）
  // /app 检测无 session 时会提供"演示模式"分支
  sessionStorage.setItem('fire-demo-mode', '1');
  window.location.href = '/app';
}

// Preline 的 hs-overlay 自己处理点击背景关闭 / ESC 关闭
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('authModalBackdrop')
    ?.addEventListener('click', e => { if (e.target === e.currentTarget) closeAuthModal(); });

  // 已登录用户直接显示"进入应用"按钮（不再阻塞渲染，async 检查）
  try {
    const session = await window.Auth.getSession();
    if (session?.user?.email) {
      const cta = document.querySelector('.landing-cta');
      if (cta) {
        cta.innerHTML = `
          <span class="logged-in-as">${session.user.email}</span>
          <button class="btn btn-primary" onclick="window.location.href='/app'">进入应用 →</button>
        `;
      }
    }
  } catch {}

  // 显示当前模式 hint（mock vs supabase）
  const noteEl = document.querySelector('.auth-note small');
  if (noteEl && window.Auth) {
    noteEl.textContent = window.Auth.isConfigured()
      ? '使用 Supabase 真实认证 · 邮箱将收到验证邮件'
      : '当前为演示模式 — 任何邮箱密码均可登录。生产环境请填 supabase-config.js';
  }

  // ESC 关闭 modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAuthModal();
  });
});
