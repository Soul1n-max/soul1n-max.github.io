-- Утренняя сводка: каждое утро (по умолчанию в 9:00 по местному времени человека) бот присылает
-- задачи на сегодня, просроченные и серию дней. Выключатель и время — на сайте в окне аватара
-- (js/avatar.js), выключить можно и кнопкой под самой сводкой.
--
-- Запустить один раз в Supabase → SQL Editor (можно повторно). Нужен 11_timezone.sql.

-- 1. Настройки сводки рядом с часовым поясом. Нет строки — сводка включена, 9:00
alter table public.user_settings add column if not exists morning         boolean not null default true;
alter table public.user_settings add column if not exists morning_time    time    not null default '09:00';
alter table public.user_settings add column if not exists morning_sent_on date;  -- местная дата последней сводки

-- Время только с 5:00 до 12:00 и ровно по минутам (на сайте шаг 30 минут)
alter table public.user_settings drop constraint if exists user_settings_morning_time;
alter table public.user_settings add constraint user_settings_morning_time
  check (morning_time between '05:00' and '12:00' and extract(second from morning_time) = 0);

-- Сайт уже может читать и писать user_settings (grant из 11_timezone.sql действует и на новые столбцы).
-- Бот выключает и включает сводку кнопкой — ему нужна запись
grant select, insert, update on public.user_settings to service_role;

-- 2. Раз в минуту база ищет тех, у кого по местному времени наступило время сводки, а сегодня
--    её ещё не было, и есть задачи на сегодня или просроченные. Отмечает их и передаёт список боту.
--    Секрет вызова — hmac(токен бота, 'morning-summary'), как у копии задач в 07_subtasks_backup.sql.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.request_morning_summary()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_tz constant text     := 'Europe/Moscow';
  late       constant interval := interval '3 hours';  -- бот спал или база была занята: позже не шлём
  token text;
  ids   bigint[];
begin
  select decrypted_secret into token
  from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if token is null then
    return 0;
  end if;

  with c as (
    select u.user_id,
           (now() at time zone coalesce(s.tz, default_tz)) as lnow,
           coalesce(s.morning_time, time '09:00')           as mt,
           s.morning_sent_on                                as sent
    from (select distinct k.user_id from public.tasks k
          where k.done = false and k.user_id is not null and k.due_date is not null
            and k.due_date <= (now() at time zone 'UTC')::date + 1) u
    left join public.user_settings s on s.user_id = u.user_id
    where coalesce(s.morning, true)
  ), pick as (
    select c.user_id, c.lnow::date as d
    from c
    where c.lnow::time >= c.mt
      and c.lnow::time <  c.mt + late
      and (c.sent is null or c.sent < c.lnow::date)
      and exists (select 1 from public.tasks k
                  where k.user_id = c.user_id and k.done = false and k.due_date <= c.lnow::date)
    limit 1000
  ), mark as (
    insert into public.user_settings (user_id, morning_sent_on)
    select user_id, d from pick
    on conflict (user_id) do update set morning_sent_on = excluded.morning_sent_on
    returning user_id
  )
  select array_agg(user_id) into ids from mark;

  if ids is null then
    return 0;
  end if;

  perform net.http_post(
    url     := 'https://synergia-planner-1.onrender.com/morning-summary',
    body    := jsonb_build_object('users', to_jsonb(ids)),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', encode(extensions.hmac('morning-summary', token, 'sha256'), 'hex')),
    timeout_milliseconds := 60000  -- бот на Render мог уснуть: даём ему минуту проснуться
  );
  return coalesce(array_length(ids, 1), 0);
end;
$$;

revoke all on function public.request_morning_summary() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'morning-summary';
select cron.schedule('morning-summary', '* * * * *', 'select public.request_morning_summary()');

-- Проверка: должно вернуть строку «morning-summary | * * * * * | true»
select jobname, schedule, active from cron.job where jobname = 'morning-summary';
