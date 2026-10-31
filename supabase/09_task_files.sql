-- Файлы в задачах: приватное хранилище Supabase Storage и список файлов в задаче.
-- Запускать целиком в Supabase → SQL Editor ДО того, как влит сайт. Повторный запуск ничего не ломает.

-- 1. Список файлов прямо в задаче: массив {id, name, path, size, type}, до 10 штук.
--    Права на tasks уже есть, столбец доступен по тем же правилам RLS (own tasks).
alter table public.tasks add column if not exists files jsonb not null default '[]'::jsonb;

alter table public.tasks drop constraint if exists tasks_files_shape;
alter table public.tasks add constraint tasks_files_shape check (
  jsonb_typeof(files) = 'array'
  and jsonb_array_length(files) <= 10
  and length(files::text) <= 10000
) not valid;

-- 2. Бакет task-files: закрытый (public = false), файл не больше 10 МБ.
--    На бесплатном тарифе Supabase всего 1 ГБ под файлы.
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 3. Доступ только к своей папке: путь файла начинается с Telegram ID владельца
--    (<telegram_id>/<id задачи>/<id файла>.<расширение>). Telegram ID берём из app_metadata —
--    его ставит только база, пользователь сам поменять не может. Без привязки Telegram доступа нет.
drop policy if exists "own task files read"   on storage.objects;
drop policy if exists "own task files insert" on storage.objects;
drop policy if exists "own task files delete" on storage.objects;

create policy "own task files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-files'
         and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'telegram_id'));

create policy "own task files insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-files'
              and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'telegram_id'));

create policy "own task files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-files'
         and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'telegram_id'));

-- Проверка: должна вернуться одна строка task-files, public = false, 10485760
select id, public, file_size_limit from storage.buckets where id = 'task-files';
