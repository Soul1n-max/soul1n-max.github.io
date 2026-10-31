-- Напоминания по времени: в момент due_date + due_time бот присылает задачу в Telegram.
-- Работает внутри Supabase: pg_cron раз в минуту вызывает send_task_reminders(),
-- функция отправляет сообщения через pg_net прямо в Telegram Bot API.
-- Ни Render, ни GitHub Actions для этого не нужны, поэтому напоминание не опаздывает,
-- даже когда бот на Render спит.
--
-- Порядок:
-- 1. Supabase → SQL Editor: выполнить этот файл целиком (можно запускать повторно).
-- 2. Там же один раз сохранить токен бота в Vault (сам токен в код не вписывать):
--      select vault.create_secret('ТОКЕН_БОТА', 'telegram_bot_token');
--    Если токен поменяли: select vault.update_secret(
--      (select id from vault.secrets where name = 'telegram_bot_token'), 'НОВЫЙ_ТОКЕН');
--
-- Время задач хранится без часового пояса — это местное время владельца из user_settings.tz
-- (11_timezone.sql; нет записи — московское).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Момент, о котором уже напомнили. Если у задачи поменяли дату или время,
-- он перестаёт совпадать, и бот напомнит ещё раз в новое время.
alter table public.tasks add column if not exists reminded_for timestamptz;

create index if not exists tasks_reminder_idx on public.tasks (due_date)
  where done = false and due_time is not null;

-- Пояса пользователей (полностью — в 11_timezone.sql: права, RLS, проверка пояса)
create table if not exists public.user_settings (
  user_id    bigint primary key,                      -- Telegram ID, как в tasks.user_id
  tz         text   not null default 'Europe/Moscow', -- часовой пояс IANA, например Asia/Yekaterinburg
  updated_at timestamptz not null default now()
);

create or replace function public.send_task_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_tz  constant text     := 'Europe/Moscow';  -- если пояс человека неизвестен
  catch_up    constant interval := interval '30 minutes';  -- пропущенные минуты всё равно отправить
  site_url    constant text     := 'https://soul1n-max.github.io/';
  token text;
  t     record;
  msg   text;
  sent  integer := 0;
begin
  select decrypted_secret into token
  from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if token is null then
    return 0;
  end if;

  for t in
    select k.id, k.user_id, k.text, k.note, k.due_time, d.due_at
    from public.tasks k
    left join public.user_settings s on s.user_id = k.user_id
    -- Время задачи — местное время владельца (user_settings.tz, его ставит сайт)
    cross join lateral (
      select (k.due_date + k.due_time) at time zone coalesce(s.tz, default_tz) as due_at
    ) d
    where k.done = false
      and k.due_time is not null
      and k.user_id is not null
      -- грубое окно по дате, чтобы работал индекс; точное сравнение — по due_at ниже
      and k.due_date between (now() at time zone 'UTC')::date - 2
                         and (now() at time zone 'UTC')::date + 1
      and d.due_at <= now()
      and d.due_at >  now() - catch_up
      and d.due_at >  k.created_at
      and k.reminded_for is distinct from d.due_at
    order by d.due_at
    limit 200
    for update of k skip locked
  loop
    msg := '<b>Напоминание</b> · ' || to_char(t.due_time, 'HH24:MI') || E'\n'
        || replace(replace(replace(t.text, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    if coalesce(btrim(t.note), '') <> '' then
      msg := msg || E'\n\n<i>'
          || replace(replace(replace(left(t.note, 1000), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
          || '</i>';
    end if;

    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
      body    := jsonb_build_object(
                   'chat_id', t.user_id,
                   'text', msg,
                   'parse_mode', 'HTML',
                   'disable_web_page_preview', true,
                   -- Кнопки обрабатывает бот (handle_task_callback в bot_webhook.py)
                   'reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(
                     jsonb_build_array(jsonb_build_object('text', '✅ Выполнено', 'callback_data', 'r:d:' || t.id)),
                     jsonb_build_array(jsonb_build_object('text', '+15 мин', 'callback_data', 'r:s:15:' || t.id),
                                       jsonb_build_object('text', '+1 час', 'callback_data', 'r:s:60:' || t.id),
                                       jsonb_build_object('text', 'Завтра', 'callback_data', 'r:t:' || t.id)),
                     jsonb_build_array(jsonb_build_object('text', 'Открыть планер', 'url', site_url))))
                 ),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );

    update public.tasks set reminded_for = t.due_at where id = t.id;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

-- Вызывать функцию может только сама база (pg_cron), не посетители сайта.
revoke all on function public.send_task_reminders() from public, anon, authenticated;

-- Каждую минуту. Повторный запуск файла заменяет задание, а не добавляет второе.
select cron.unschedule(jobid) from cron.job where jobname = 'task-reminders';
select cron.schedule('task-reminders', '* * * * *', 'select public.send_task_reminders()');

-- Ответы Telegram pg_net хранит 6 часов в net._http_response — там видно ошибки отправки,
-- например 403, если пользователь заблокировал бота.
