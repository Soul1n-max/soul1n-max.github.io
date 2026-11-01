-- Статистика для админа: сколько людей, новых, привязавших Telegram, сколько задач создают и закрывают.
-- Только числа: ни текстов задач, ни почт, ни имён функция не отдаёт (152-ФЗ).
-- Кто админ, решает база (таблица admins), а не сайт: чужой аккаунт получит ошибку, даже если покажет
-- себе кнопку в браузере. На сайте — пункт «Статистика» в окне аватара (js/admin.js).
--
-- Запустить один раз в Supabase → SQL Editor (можно повторно). В последней строке впишите свою почту.

-- 1. Список админов. Сайт его не читает и не меняет: RLS включён, политик нет
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- 2. Сайт спрашивает «я админ?», чтобы показать пункт меню. Ответ — только про себя
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 3. Сама статистика. Сутки и неделя — последние 24 часа и 7 дней; дни графика — по Москве
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  msk  constant text := 'Europe/Moscow';
  res  jsonb;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users_total',  (select count(*) from auth.users),
    'users_day',    (select count(*) from auth.users where created_at > now() - interval '1 day'),
    'users_week',   (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'tg_linked',    (select count(*) from auth.users where raw_app_meta_data ? 'telegram_id'),
    'active_week',  (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'tasks_total',  (select count(*) from public.tasks),
    'tasks_open',   (select count(*) from public.tasks where not done),
    'created_day',  (select count(*) from public.tasks where created_at > now() - interval '1 day'),
    'created_week', (select count(*) from public.tasks where created_at > now() - interval '7 days'),
    'done_day',     (select count(*) from public.tasks where done and done_at > now() - interval '1 day'),
    'done_week',    (select count(*) from public.tasks where done and done_at > now() - interval '7 days'),
    -- 14 дней: новые задачи и выполненные по дням
    'days', (
      select jsonb_agg(jsonb_build_object(
               'day',     to_char(d, 'YYYY-MM-DD'),
               'created', (select count(*) from public.tasks t
                           where (t.created_at at time zone msk)::date = d),
               'done',    (select count(*) from public.tasks t
                           where t.done and (t.done_at at time zone msk)::date = d)
             ) order by d)
      from generate_series((now() at time zone msk)::date - 13, (now() at time zone msk)::date, interval '1 day') g(d0),
           lateral (select g.d0::date as d) x
    )
  ) into res;
  return res;
end;
$$;

revoke execute on function public.is_admin()    from public, anon;
revoke execute on function public.admin_stats() from public, anon;
grant  execute on function public.is_admin()    to authenticated;
grant  execute on function public.admin_stats() to authenticated;

-- 4. Назначить админа: ваш аккаунт на сайте (почта, с которой входите). Можно повторно
insert into public.admins (user_id)
select id from auth.users where lower(email) = lower('почта@пример.ru')
on conflict do nothing;
