-- Шаг 3. Вход на сайт через Telegram. Запускать в Supabase → SQL Editor.
-- Нужен после 01_telegram_link.sql и 02_rls_app_metadata.sql; их не меняет.
--
-- Сайт открывает окно входа Telegram (oauth.telegram.org) и отправляет подписанный
-- Telegram ответ боту на Render. Бот проверяет подпись токеном бота и по Telegram ID
-- находит аккаунт сайта этой функцией (или создаёт новый), затем выдаёт сайту
-- одноразовый токен входа.

-- Email аккаунта, к которому привязан этот Telegram ID (или null). Только для бота.
create or replace function public.telegram_login_email(p_telegram_id bigint)
returns text
language sql
security definer
set search_path = public
as $$
  select email from auth.users
   where raw_app_meta_data ->> 'telegram_id' = p_telegram_id::text
   order by created_at
   limit 1;
$$;
revoke execute on function public.telegram_login_email(bigint) from public, anon, authenticated;
grant  execute on function public.telegram_login_email(bigint) to service_role;
