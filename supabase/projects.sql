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

-- Доступ только к своим проектам — то же правило, что у политики `own tasks` на tasks
alter table public.projects enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects
  for all to authenticated
  using      (user_id::text = auth.jwt() -> 'user_metadata' ->> 'telegram_id')
  with check (user_id::text = auth.jwt() -> 'user_metadata' ->> 'telegram_id');

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
