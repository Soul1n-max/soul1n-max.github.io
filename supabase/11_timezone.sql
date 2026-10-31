-- Часовой пояс пользователя: напоминания приходят по его местному времени, а не по московскому.
-- Пояс сайт определяет сам по устройству и пишет в user_settings (syncTimezone в js/data.js),
-- бот читает его, чтобы понимать «сегодня», «завтра» и «+15 мин». Нет записи — Москва.
--
-- Запустить один раз в Supabase → SQL Editor (можно повторно). Заменяет send_task_reminders()
-- из 04_reminders.sql — там теперь тот же текст функции.

create table if not exists public.user_settings (
  user_id    bigint primary key,                      -- Telegram ID, как в tasks.user_id
  tz         text   not null default 'Europe/Moscow', -- часовой пояс IANA, например Asia/Yekaterinburg
  updated_at timestamptz not null default now()
);

-- Неизвестный пояс сломал бы напоминания всем (at time zone выдаёт ошибку), поэтому проверяем его при записи
create or replace function public.user_settings_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.tz) then
    raise exception 'Неизвестный часовой пояс: %', left(new.tz, 64) using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_settings_check on public.user_settings;
create trigger user_settings_check before insert or update on public.user_settings
  for each row execute function public.user_settings_check();

-- Новые таблицы в этом Supabase закрыты для сайта без явного grant
grant select, insert, update on public.user_settings to authenticated;
grant select on public.user_settings to service_role;  -- бот читает пояс секретным ключом
revoke all on public.user_settings from anon;

-- Только своя строка — то же правило, что у задач (Telegram ID из app_metadata, его ставит только база)
alter table public.user_settings enable row level security;
drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all to authenticated
  using      (user_id::text = (select auth.jwt() -> 'app_metadata' ->> 'telegram_id'))
  with check (user_id::text = (select auth.jwt() -> 'app_metadata' ->> 'telegram_id'));

-- Напоминания по местному времени каждого
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

revoke all on function public.send_task_reminders() from public, anon, authenticated;

-- Проверка: должно вернуть строку «user_settings | true»
select relname, relrowsecurity from pg_class where relname = 'user_settings';
