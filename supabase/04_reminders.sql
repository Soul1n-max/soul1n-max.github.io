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
-- Время задач хранится без часового пояса, считаем его московским (reminder_tz ниже).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Момент, о котором уже напомнили. Если у задачи поменяли дату или время,
-- он перестаёт совпадать, и бот напомнит ещё раз в новое время.
alter table public.tasks add column if not exists reminded_for timestamptz;

create index if not exists tasks_reminder_idx on public.tasks (due_date)
  where done = false and due_time is not null;

create or replace function public.send_task_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder_tz constant text     := 'Europe/Moscow';
  catch_up    constant interval := interval '30 minutes';  -- пропущенные минуты всё равно отправить
  site_url    constant text     := 'https://soul1n-max.github.io/sinergia-planner/';
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
    select id, user_id, text, note,
           due_time,
           (due_date + due_time) at time zone reminder_tz as due_at
    from public.tasks
    where done = false
      and due_time is not null
      and user_id is not null
      and due_date between (now() at time zone reminder_tz)::date - 1
                       and (now() at time zone reminder_tz)::date
      and (due_date + due_time) at time zone reminder_tz <= now()
      and (due_date + due_time) at time zone reminder_tz >  now() - catch_up
      and (due_date + due_time) at time zone reminder_tz >  created_at
      and reminded_for is distinct from (due_date + due_time) at time zone reminder_tz
    order by due_date, due_time
    limit 200
    for update skip locked
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
