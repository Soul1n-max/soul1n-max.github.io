-- Список пользователей для админа: имя, почта, ник в Telegram, дата регистрации, последний вход и
-- сколько у человека задач (только число). Тексты задач, заметки и файлы функция не отдаёт (152-ФЗ).
-- Доступ — по той же таблице admins, что и статистика (13_admin_stats.sql): сначала запустите его.
-- На сайте — вкладка «Пользователи» в окне «Статистика» (js/admin.js).
--
-- Запустить один раз в Supabase → SQL Editor (можно повторно).

create or replace function public.admin_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  res jsonb;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  with counts as (
    select t.user_id::text as tg, count(*) as total, count(*) filter (where not t.done) as open
    from public.tasks t
    group by t.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',         u.id,
           'name',       coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                                  nullif(btrim(u.raw_user_meta_data ->> 'tg_name'), '')),
           -- служебную почту tg<ID>@… у аккаунтов из Telegram не показываем
           'email',      case when u.email ~ '^tg[0-9]+@' then null else u.email end,
           'tg_username', u.raw_user_meta_data ->> 'tg_username',
           'tg',         u.raw_app_meta_data ? 'telegram_id',
           'confirmed',  u.email_confirmed_at is not null,
           'blocked',    coalesce(u.banned_until > now(), false),
           'created_at', u.created_at,
           'last_sign_in_at', u.last_sign_in_at,
           'tasks',      coalesce(c.total, 0),
           'tasks_open', coalesce(c.open, 0)
         ) order by u.created_at desc), '[]'::jsonb)
  into res
  from auth.users u
  left join counts c on c.tg = u.raw_app_meta_data ->> 'telegram_id';
  return res;
end;
$$;

revoke execute on function public.admin_users() from public, anon;
grant  execute on function public.admin_users() to authenticated;
