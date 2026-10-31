-- Проверка безопасности базы. Только читает, ничего не меняет — можно запускать сколько угодно.
-- Supabase → SQL Editor → вставить файл целиком → Run. Результат — одна таблица.
--
-- Что должно получиться:
--   «RLS выключен»            — строк быть не должно;
--   «Политика»                — только own tasks, own projects и own settings (роль authenticated, условие с app_metadata);
--   «Функция доступна сайту»  — только link_telegram (authenticated);
--   «Права anon на таблицу»   — строк быть не должно (после 06_hardening.sql);
--   «Представление» и «Публичное хранилище» — строк быть не должно.
-- Любая другая строка — повод разобраться.

select 'RLS выключен' as проверка, c.relname::text as объект, 'таблица видна всем через API' as подробности
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity

union all
select 'Политика', tablename || ': ' || policyname,
       'роли ' || array_to_string(roles, ',') || ', ' || cmd || ', условие: ' || coalesce(qual, '—')
  from pg_policies where schemaname = 'public'

union all
select 'Функция доступна сайту', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       concat_ws(', ',
         case when has_function_privilege('anon', p.oid, 'execute') then 'anon (без входа)' end,
         case when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated' end)
       || case when p.prosecdef then ' · security definer' else '' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))

union all
select 'Права anon на таблицу', table_name::text, string_agg(privilege_type, ', ')
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon'
 group by table_name

union all
select 'Представление', c.relname::text, 'представления обходят RLS, если не security_invoker'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('v', 'm')

union all
select 'Публичное хранилище', name, 'файлы бакета открыты всем по ссылке'
  from storage.buckets where public

union all
select 'Политика хранилища', policyname,
       'роли ' || array_to_string(roles, ',') || ', ' || cmd || ', условие: ' || coalesce(qual, with_check, '—')
  from pg_policies where schemaname = 'storage' and tablename = 'objects'

order by 1, 2;
