-- Таблица проектов: раньше проекты жили только в localStorage браузера.
-- Запустить один раз в Supabase → SQL Editor. Скрипт можно запускать повторно.

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    bigint not null,                -- Telegram ID владельца, как в tasks.user_id
  name       text   not null check (char_length(name) between 1 and 60),
  color      text   not null default '#8b78f0',
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);

-- Доступ только к своим проектам — то же правило, что у политики `own tasks` на tasks.
-- Если tasks уже переведена на app_metadata (supabase/02_rls_app_metadata.sql), берём его же:
-- user_metadata пользователь может менять сам, поэтому повторный запуск не должен откатывать политику.
alter table public.projects enable row level security;

do $$
declare
  meta text := 'user_metadata';
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and qual ilike '%app_metadata%'
  ) then
    meta := 'app_metadata';
  end if;
  execute 'drop policy if exists "own projects" on public.projects';
  execute format(
    'create policy "own projects" on public.projects for all to authenticated
       using      (user_id::text = (select auth.jwt() -> %1$L ->> ''telegram_id''))
       with check (user_id::text = (select auth.jwt() -> %1$L ->> ''telegram_id''))',
    meta);
end $$;

-- Realtime: изменения проектов сразу приходят на другие устройства
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;
