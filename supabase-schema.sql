-- ============================================================
-- FIRE Planner — Supabase schema
-- ------------------------------------------------------------
-- 在 Supabase 项目的 SQL Editor 里执行一次即可。
-- 之后只要在 demo/supabase-config.js 里填入 URL 和 anon key，
-- 前端就会自动开始云端同步 + 多租户隔离（RLS 保护）。
-- ============================================================

-- 用户方案存储：每个用户一行（payload 是完整 store JSON）
create table if not exists public.plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

-- 自动更新 updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch
  before update on public.plans
  for each row execute function public.touch_updated_at();

-- 行级安全：用户只能 select / insert / update / delete 自己的行
alter table public.plans enable row level security;

drop policy if exists "own plans" on public.plans;
create policy "own plans" on public.plans
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 推荐索引（user_id 已是 PK，无需额外）

-- ============================================================
-- 部署后还要做的事
-- ------------------------------------------------------------
-- 1. Supabase 项目 → Authentication → Providers → 启用 Email 注册
-- 2. （可选）→ 配置 SMTP 让验证邮件能正常发出
-- 3. 在 demo/supabase-config.js 填 url 和 anonKey
-- ============================================================
