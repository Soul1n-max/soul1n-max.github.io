-- Рассылка через бота: админ пишет новость на сайте (окно аватара → «Статистика» → вкладка «Рассылка», js/admin.js), база собирает
-- Telegram ID всех пользователей и передаёт боту, бот присылает каждому сообщение.
-- Кто админ, решает база (таблица admins из 13_admin_stats.sql): чужой аккаунт получит ошибку.
-- Под каждой новостью кнопка «Не присылать новости» — таких людей рассылка пропускает.
--
-- Запустить один раз в Supabase → SQL Editor (можно повторно). Нужны 11_timezone.sql, 13_admin_stats.sql и 16_admin_block_delete.sql.

-- 1. Выключатель новостей рядом с остальными настройками. Нет строки — новости приходят
alter table public.user_settings add column if not exists news boolean not null default true;

-- 2. Журнал рассылок. Сайт его не читает напрямую — только через функции ниже. Бот пишет итог
create table if not exists public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(btrim(text)) between 1 and 3500),
  test        boolean not null default false,  -- «Отправить себе»: только админу
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  recipients  integer not null default 0,
  sent        integer,                          -- null — бот ещё отправляет
  failed      integer,
  finished_at timestamptz
);
alter table public.broadcasts enable row level security;
revoke all on public.broadcasts from anon, authenticated;
grant select, update on public.broadcasts to service_role;

-- Кому слать: все Telegram ID — привязанные на сайте и те, кто пишет только боту. Кроме выключивших новости
-- и заблокированных (blocked_users из 16_admin_block_delete.sql)
create or replace function public.broadcast_audience()
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct a.id), '{}')
  from (
    select (u.raw_app_meta_data ->> 'telegram_id')::bigint as id
    from auth.users u
    where u.raw_app_meta_data ->> 'telegram_id' ~ '^[0-9]{1,15}$'
    union
    select t.user_id from public.tasks t where t.user_id is not null
  ) a
  left join public.user_settings s on s.user_id = a.id
  where a.id > 0 and coalesce(s.news, true)
    and not exists (select 1 from public.blocked_users b where b.telegram_id = a.id);  -- заблокированным админом не шлём
$$;
revoke all on function public.broadcast_audience() from public, anon, authenticated;

-- 3. Окно рассылки: сколько человек получат и последние 10 рассылок
create or replace function public.admin_broadcasts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'audience', coalesce(array_length(public.broadcast_audience(), 1), 0),
    'me_linked', (auth.jwt() -> 'app_metadata' ->> 'telegram_id') ~ '^[0-9]{1,15}$',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'text', b.text, 'test', b.test, 'created_at', b.created_at,
               'recipients', b.recipients, 'sent', b.sent, 'failed', b.failed) order by b.created_at desc)
      from (select * from public.broadcasts order by created_at desc limit 10) b), '[]'::jsonb)
  );
end;
$$;

-- 4. Отправка. p_test = true — только себе (проверить, как выглядит). Секрет вызова бота —
--    hmac(токен бота, 'broadcast'), как у утренней сводки в 12_morning_summary.sql
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_broadcast(p_text text, p_test boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  token text;
  msg   text := btrim(coalesce(p_text, ''));
  me    text := auth.jwt() -> 'app_metadata' ->> 'telegram_id';
  ids   bigint[];
  bid   uuid;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if char_length(msg) not between 1 and 3500 then
    raise exception 'Текст — от 1 до 3500 знаков' using errcode = '22023';
  end if;

  if p_test then
    if me is null or me !~ '^[0-9]{1,15}$' then
      raise exception 'Привяжите Telegram, чтобы прислать проверку себе' using errcode = '22023';
    end if;
    ids := array[me::bigint];
  else
    -- Защита от двойного нажатия и повтора: одна рассылка всем не чаще раза в 5 минут
    if exists (select 1 from public.broadcasts
               where not test and created_at > now() - interval '5 minutes') then
      raise exception 'Рассылка уже была меньше 5 минут назад' using errcode = '22023';
    end if;
    ids := public.broadcast_audience();
    if coalesce(array_length(ids, 1), 0) = 0 then
      raise exception 'Пока некому отправлять' using errcode = '22023';
    end if;
  end if;

  select decrypted_secret into token
  from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if token is null then
    raise exception 'В Vault нет telegram_bot_token' using errcode = '22023';
  end if;

  insert into public.broadcasts (text, test, created_by, recipients)
  values (msg, p_test, auth.uid(), array_length(ids, 1))
  returning id into bid;

  -- Текст бот берёт из таблицы по id — в запросе только id и список получателей
  perform net.http_post(
    url     := 'https://synergia-planner-1.onrender.com/broadcast',
    body    := jsonb_build_object('id', bid, 'users', to_jsonb(ids)),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', encode(extensions.hmac('broadcast', token, 'sha256'), 'hex')),
    timeout_milliseconds := 60000  -- бот на Render мог уснуть: даём ему минуту проснуться
  );
  return jsonb_build_object('id', bid, 'recipients', array_length(ids, 1));
end;
$$;

revoke execute on function public.admin_broadcasts()               from public, anon;
revoke execute on function public.admin_broadcast(text, boolean)   from public, anon;
grant  execute on function public.admin_broadcasts()               to authenticated;
grant  execute on function public.admin_broadcast(text, boolean)   to authenticated;

-- Бот выключает и включает новости кнопкой (запись в user_settings уже разрешена в 12_morning_summary.sql)
grant select, insert, update on public.user_settings to service_role;

-- Проверка: должно вернуть одно число — сколько человек получат рассылку
select coalesce(array_length(public.broadcast_audience(), 1), 0) as audience;
