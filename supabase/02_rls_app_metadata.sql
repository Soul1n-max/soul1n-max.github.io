-- Шаг 2. Переключить RLS на app_metadata.
-- Запускать после того, как бот умеет /link, сайт обновлён и вы привязали Telegram кодом.

-- Посмотреть, у кого сейчас какая привязка:
-- select email,
--        raw_user_meta_data ->> 'telegram_id' as tg_user_meta,
--        raw_app_meta_data  ->> 'telegram_id' as tg_app_meta
--   from auth.users order by created_at;

drop policy if exists "own tasks" on public.tasks;

create policy "own tasks" on public.tasks
  for all
  to authenticated
  using      (user_id::text = (select auth.jwt() -> 'app_metadata' ->> 'telegram_id'))
  with check (user_id::text = (select auth.jwt() -> 'app_metadata' ->> 'telegram_id'));

-- Проверка: других политик на tasks быть не должно, иначе они тоже пускают к строкам.
-- select policyname, roles, cmd, qual from pg_policies where tablename = 'tasks';
