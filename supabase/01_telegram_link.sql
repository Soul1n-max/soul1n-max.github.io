-- Шаг 1. Привязка Telegram через одноразовый код от бота.
-- Ничего не ломает: старая политика RLS пока остаётся. Запускать в Supabase → SQL Editor.

-- Коды привязки. RLS включён без политик: сайт таблицу не видит,
-- читать и писать её могут только функции ниже и секретный ключ бота.
create table if not exists public.telegram_link_codes (
  code        text primary key,
  telegram_id bigint      not null,
  expires_at  timestamptz not null
);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;

-- Вызывает бот по команде /link (секретным ключом). Возвращает код из 8 символов,
-- который живёт 10 минут. Прежние коды этого Telegram ID удаляются.
create or replace function public.issue_telegram_link_code(p_telegram_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- без 0/O и 1/I
  bytes bytea;
  new_code text := '';
begin
  if p_telegram_id is null then
    raise exception 'telegram_id is required';
  end if;

  delete from telegram_link_codes
   where telegram_id = p_telegram_id or expires_at < now();

  -- gen_random_uuid() даёт криптостойкие случайные байты без расширений
  bytes := uuid_send(gen_random_uuid());
  for i in 0..7 loop
    new_code := new_code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;

  insert into telegram_link_codes (code, telegram_id, expires_at)
  values (new_code, p_telegram_id, now() + interval '10 minutes');

  return new_code;
end;
$$;
revoke execute on function public.issue_telegram_link_code(bigint) from public, anon, authenticated;
grant  execute on function public.issue_telegram_link_code(bigint) to service_role;

-- Вызывает сайт: вошедший пользователь вводит код из бота.
-- Telegram ID записывается в app_metadata — его пользователь сам изменить не может.
create or replace function public.link_telegram(p_code text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tg  bigint;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from telegram_link_codes
   where code = upper(btrim(p_code)) and expires_at > now()
  returning telegram_id into tg;

  if tg is null then
    raise exception 'Код неверный или устарел. Отправьте боту /link ещё раз.';
  end if;

  -- Один Telegram — один аккаунт: снимаем привязку с других аккаунтов
  update auth.users
     set raw_app_meta_data = raw_app_meta_data - 'telegram_id'
   where id <> uid and raw_app_meta_data ->> 'telegram_id' = tg::text;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('telegram_id', tg),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'telegram_id'
   where id = uid;

  return tg;
end;
$$;
revoke execute on function public.link_telegram(text) from public, anon;
grant  execute on function public.link_telegram(text) to authenticated;
