-- Дополнительная защита базы. Запускать в Supabase → SQL Editor после 05_security_check.sql.
-- Можно запускать повторно. Работу сайта и бота не меняет.

-- 1. Гостям без входа (роль anon) таблицы задач и проектов не нужны вовсе.
--    Сейчас их и так не пускает RLS, это второй замок на случай ошибки в политике.
revoke all on public.tasks    from anon;
revoke all on public.projects from anon;

-- 2. Ограничения на данные. not valid: уже сохранённые строки не проверяются, только новые и изменённые.
--    Цвет проекта сайт вставляет в style="…", поэтому принимаем только вид #RRGGBB.
alter table public.projects drop constraint if exists projects_color_hex;
alter table public.projects add  constraint projects_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$') not valid;

--    Длина текста: 4096 — предел сообщения Telegram, бот длиннее не пришлёт.
alter table public.tasks drop constraint if exists tasks_text_len;
alter table public.tasks add  constraint tasks_text_len check (char_length(text) <= 4096) not valid;
alter table public.tasks drop constraint if exists tasks_note_len;
alter table public.tasks add  constraint tasks_note_len check (char_length(note) <= 10000) not valid;

-- 3. Старые коды привязки Telegram, которые никто не ввёл, удаляем раз в сутки.
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-link-codes';
select cron.schedule('cleanup-link-codes', '17 3 * * *',
  'delete from public.telegram_link_codes where expires_at < now()');
