-- 四步漏斗事件 + fake-door 留资。匿名可写（公开落地页），不可读。
create table if not exists tz_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  event text not null check (event in ('page_view','calc_done','cta_click','lead_submit')),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists tz_events_event_idx on tz_events(event);

create table if not exists tz_leads (
  id bigint generated always as identity primary key,
  session_id text,
  contact text not null,
  channel text,
  created_at timestamptz default now()
);

alter table tz_events enable row level security;
alter table tz_leads  enable row level security;

-- 仅允许匿名 INSERT，禁止匿名 SELECT（数据从 dashboard 看）
-- drop-if-exists 让本迁移可重复执行（policy 无 IF NOT EXISTS）
drop policy if exists tz_events_anon_insert on tz_events;
drop policy if exists tz_leads_anon_insert  on tz_leads;
create policy tz_events_anon_insert on tz_events for insert to anon with check (true);
create policy tz_leads_anon_insert  on tz_leads  for insert to anon with check (true);
