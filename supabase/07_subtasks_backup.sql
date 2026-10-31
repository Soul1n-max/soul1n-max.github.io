-- Подзадачи, новые повторы и копия задач раз в неделю.
-- Запускать целиком в Supabase → SQL Editor ДО того, как влит сайт и выложен бот:
-- новый сайт и бот уже читают и пишут поле subtasks. Повторный запуск ничего не ломает.

-- 1. Подзадачи: массив {id, text, done} прямо в задаче. Права на таблицу tasks уже есть,
--    новый столбец доступен по тем же правилам RLS (own tasks).
alter table public.tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;

alter table public.tasks drop constraint if exists tasks_subtasks_shape;
alter table public.tasks add constraint tasks_subtasks_shape check (
  jsonb_typeof(subtasks) = 'array'
  and jsonb_array_length(subtasks) <= 50
  and length(subtasks::text) <= 20000
) not valid;

-- 2. Повторы: кроме daily / weekly / monthly теперь weekdays (по будням), yearly
--    и «раз в N»: days:N, weeks:N, months:N (N от 2 до 365).
alter table public.tasks drop constraint if exists tasks_recur_values;
alter table public.tasks add constraint tasks_recur_values check (
  recur is null
  or recur in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')
  or (recur ~ '^(days|weeks|months):[0-9]{1,3}$' and split_part(recur, ':', 2)::int between 2 and 365)
) not valid;

-- 3. Копия задач: по воскресеньям в 20:00 по Москве (17:00 UTC) база просит бота прислать
--    каждому его задачи файлом. Секрет вызова — hmac(токен бота, 'weekly-backup'): бот считает так же,
--    токен уже лежит в Vault (его положил 04_reminders.sql), отдельный секрет заводить не нужно.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.request_weekly_backup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  select decrypted_secret into token
  from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if token is null then
    return;
  end if;
  perform net.http_post(
    url     := 'https://synergia-planner-1.onrender.com/weekly-backup',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', encode(extensions.hmac('weekly-backup', token, 'sha256'), 'hex')),
    -- бот на Render мог уснуть: даём ему минуту проснуться
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.request_weekly_backup() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'weekly-backup';
select cron.schedule('weekly-backup', '0 17 * * 0', 'select public.request_weekly_backup()');
