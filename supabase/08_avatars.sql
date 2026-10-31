-- Шаг 8. Хранилище для своих фото на аватар. Запускать в Supabase → SQL Editor один раз.
-- Ничего в задачах и проектах не меняет.
--
-- Бакет avatars публичный на чтение (картинку показывает обычный <img>), но писать и удалять
-- можно только свой файл: путь <id аккаунта>/avatar.jpg, где id — auth.uid() вошедшего.
-- Сайт сам уменьшает фото до 256×256, поэтому лимит 1 МБ с запасом.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars read own"   on storage.objects;
drop policy if exists "avatars insert own" on storage.objects;
drop policy if exists "avatars update own" on storage.objects;
drop policy if exists "avatars delete own" on storage.objects;

-- Чтение своей строки нужно для замены файла (upsert); показ картинки идёт по публичной ссылке
create policy "avatars read own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Проверка: должна вернуться одна строка avatars с public = true
select id, public, file_size_limit from storage.buckets where id = 'avatars';
