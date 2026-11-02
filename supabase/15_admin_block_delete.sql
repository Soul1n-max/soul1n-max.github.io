-- Блокировка и удаление аккаунта админом (по просьбе человека или за спам).
-- Нужен после 13_admin_stats.sql (таблица admins) и 14_admin_users.sql (список пользователей).
-- На сайте — кнопки в строке пользователя во вкладке «Пользователи» окна «Статистика» (js/admin-actions.js).
-- Кто админ, решает база: чужой аккаунт получит ошибку «Нет доступа». Себя и других админов трогать нельзя.
--
-- Блокировка: вход на сайт закрыт (Supabase Auth не пускает аккаунт с banned_until в будущем), все входы
-- в браузерах сбрасываются, бот перестаёт принимать сообщения с этого Telegram (таблица blocked_users).
-- Уже открытая вкладка у человека работает до конца текущего входа — не дольше часа.
-- Удаление: стираются задачи, проекты, настройки, файлы задач и аватар, затем сам аккаунт. Если аккаунт
-- был заблокирован, запись о блокировке остаётся: заново войти через этот Telegram и писать боту нельзя.
--
-- Запустить один раз в Supabase → SQL Editor (можно повторно).

-- 1. Кого заблокировали. Сайт таблицу не видит (RLS без политик), читает её бот секретным ключом
create table if not exists public.blocked_users (
  id          bigint generated always as identity primary key,
  user_id     uuid unique references auth.users (id) on delete set null,
  telegram_id bigint,
  email       text,
  reason      text check (reason is null or length(reason) <= 300),
  blocked_at  timestamptz not null default now(),
  blocked_by  uuid
);
create index if not exists blocked_users_tg on public.blocked_users (telegram_id);
alter table public.blocked_users enable row level security;
revoke all on public.blocked_users from anon, authenticated;
grant select on public.blocked_users to service_role;

-- Общая проверка: вызывающий — админ, цель — существующий аккаунт, не он сам и не другой админ
create or replace function public.admin_target(p_user uuid)
returns auth.users
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u auth.users;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Свой аккаунт отсюда менять нельзя' using errcode = '42501';
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then
    raise exception 'Другого админа отсюда менять нельзя' using errcode = '42501';
  end if;
  select * into u from auth.users where id = p_user;
  if u.id is null then
    raise exception 'Аккаунт не найден' using errcode = 'P0002';
  end if;
  return u;
end;
$$;
revoke execute on function public.admin_target(uuid) from public, anon, authenticated;

-- 2. Заблокировать
create or replace function public.admin_block_user(p_user uuid, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  u  auth.users := public.admin_target(p_user);
  tg bigint     := nullif(u.raw_app_meta_data ->> 'telegram_id', '')::bigint;
begin
  -- 100 лет, как делает сам Supabase Auth; бесконечность ('infinity') он прочитать не может
  update auth.users set banned_until = now() + interval '100 years' where id = u.id;
  -- Выйти из всех браузеров: без сессий токен входа не продлится
  delete from auth.refresh_tokens where user_id = u.id::text;
  delete from auth.sessions       where user_id = u.id;

  insert into public.blocked_users (user_id, telegram_id, email, reason, blocked_by)
  values (u.id, tg, u.email, nullif(left(trim(coalesce(p_reason, '')), 300), ''), auth.uid())
  on conflict (user_id) do update
    set telegram_id = excluded.telegram_id, email = excluded.email, reason = excluded.reason,
        blocked_at = now(), blocked_by = excluded.blocked_by;
end;
$$;

-- 3. Разблокировать
create or replace function public.admin_unblock_user(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  u  auth.users := public.admin_target(p_user);
  tg bigint     := nullif(u.raw_app_meta_data ->> 'telegram_id', '')::bigint;
begin
  update auth.users set banned_until = null where id = u.id;
  delete from public.blocked_users where user_id = u.id or (tg is not null and telegram_id = tg);
end;
$$;

-- 4. Удалить аккаунт и все его данные. Возвращает, сколько стёрто задач и проектов
create or replace function public.admin_delete_user(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  u      auth.users := public.admin_target(p_user);
  tg     bigint     := nullif(u.raw_app_meta_data ->> 'telegram_id', '')::bigint;
  ntasks integer    := 0;
  nproj  integer    := 0;
  token  text;
begin
  -- Данные задач лежат по Telegram ID. Если этот Telegram ID есть ещё у другого аккаунта
  -- (так бывает, только если привязку делали вручную), задачи не трогаем: они общие
  if tg is not null and not exists (
       select 1 from auth.users
       where id <> u.id and raw_app_meta_data ->> 'telegram_id' = tg::text) then
    delete from public.tasks where user_id = tg;
    get diagnostics ntasks = row_count;
    delete from public.projects where user_id = tg;
    get diagnostics nproj = row_count;
    delete from public.user_settings       where user_id = tg;
    delete from public.telegram_link_codes where telegram_id = tg;
  else
    tg := null;
  end if;

  -- Файлы (task-files/<telegram_id>/…, avatars/<id>/…) база стереть сама не может — только через
  -- Storage API. Их стирает бот секретным ключом: hmac(токен бота, 'purge-files'), токен — в Vault
  select decrypted_secret into token
  from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if token is not null then
    perform net.http_post(
      url     := 'https://synergia-planner-1.onrender.com/purge-files',
      body    := jsonb_build_object('telegram_id', tg, 'user_id', u.id),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'X-Cron-Secret', encode(extensions.hmac('purge-files', token, 'sha256'), 'hex')),
      timeout_milliseconds := 60000  -- бот на Render мог уснуть
    );
  end if;

  -- Сам аккаунт: вместе с ним уходят входы, способы входа и согласия (они в user_metadata).
  -- Запись о блокировке, если была, остаётся без ссылки на аккаунт (user_id станет null)
  delete from auth.users where id = u.id;

  return jsonb_build_object('tasks', ntasks, 'projects', nproj);
end;
$$;

revoke execute on function public.admin_block_user(uuid, text) from public, anon;
revoke execute on function public.admin_unblock_user(uuid)     from public, anon;
revoke execute on function public.admin_delete_user(uuid)      from public, anon;
grant  execute on function public.admin_block_user(uuid, text) to authenticated;
grant  execute on function public.admin_unblock_user(uuid)     to authenticated;
grant  execute on function public.admin_delete_user(uuid)      to authenticated;

-- Проверка: должно вернуть три строки — admin_block_user, admin_delete_user, admin_unblock_user
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('admin_block_user', 'admin_unblock_user', 'admin_delete_user')
order by proname;
