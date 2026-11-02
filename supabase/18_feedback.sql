-- Обратная связь: пользователи пишут об ошибках и пожеланиях, админ видит всё в одном месте.
-- На сайте: пункт «Ошибка или пожелание» в окне аватара (у всех) и «Отзывы» (только у админа), js/feedback.js.
-- Админ — тот же список public.admins из 13_admin_stats.sql (запустите сначала его).
-- О каждом новом сообщении бот пишет админу в Telegram (если у админа привязан Telegram).
--
-- Запустить один раз в Supabase → SQL Editor (можно повторно).

-- 1. Таблица. Сайт её напрямую не читает и не пишет: только через функции ниже
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('bug', 'idea')),
  text       text not null check (length(btrim(text)) between 1 and 2000),
  page       text check (length(page) <= 300),
  device     text check (length(device) <= 300),
  status     text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

-- 2. Отправить сообщение. Не больше 10 в час от одного человека — от спама
create or replace function public.send_feedback(p_kind text, p_text text, p_page text default null, p_device text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  msg   text := btrim(coalesce(p_text, ''));
  new_id uuid;
  token text;
  who   text;
  a     record;
begin
  if uid is null then
    raise exception 'Войдите, чтобы отправить сообщение' using errcode = '42501';
  end if;
  if p_kind not in ('bug', 'idea') then
    raise exception 'Неизвестный тип сообщения' using errcode = '22023';
  end if;
  if msg = '' then
    raise exception 'Напишите текст сообщения' using errcode = '22023';
  end if;
  if (select count(*) from public.feedback
      where user_id = uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Слишком много сообщений подряд, попробуйте через час' using errcode = '54000';
  end if;

  insert into public.feedback (user_id, kind, text, page, device)
  values (uid, p_kind, left(msg, 2000), left(p_page, 300), left(p_device, 300))
  returning id into new_id;

  -- Уведомление админам в Telegram. Если не получилось — сообщение всё равно сохранено
  begin
    select decrypted_secret into token
    from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
    if token is not null then
      select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''),
                      nullif(u.raw_user_meta_data ->> 'tg_name', ''),
                      split_part(u.email, '@', 1), 'Пользователь')
             || coalesce(' · ' || nullif(u.email, ''), '')
             || coalesce(' · @' || nullif(u.raw_user_meta_data ->> 'tg_username', ''), '')
        into who
      from auth.users u where u.id = uid;
      for a in
        select (u.raw_app_meta_data ->> 'telegram_id') as tg
        from public.admins ad join auth.users u on u.id = ad.user_id
        where u.raw_app_meta_data ? 'telegram_id'
      loop
        perform net.http_post(
          url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
          body    := jsonb_build_object(
                       'chat_id', a.tg,
                       'text', '<b>' || case when p_kind = 'bug' then 'Ошибка' else 'Пожелание' end || '</b> от '
                               || replace(replace(replace(coalesce(who, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
                               || E'\n\n'
                               || replace(replace(replace(left(msg, 3000), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
                               || E'\n\nВсе сообщения — на сайте: аватар → «Отзывы».',
                       'parse_mode', 'HTML',
                       'disable_web_page_preview', true),
          headers := '{"Content-Type": "application/json"}'::jsonb
        );
      end loop;
    end if;
  exception when others then
    null;
  end;

  return new_id;
end;
$$;

-- 3. Список для админа: сообщение и кто написал (имя, почта, @ник — чтобы можно было ответить).
--    Задачи людей сюда не попадают
create or replace function public.admin_feedback()
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'kind', f.kind, 'text', f.text, 'page', f.page, 'device', f.device,
             'status', f.status, 'created_at', f.created_at,
             'name', coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''),
                              nullif(u.raw_user_meta_data ->> 'tg_name', ''),
                              split_part(u.email, '@', 1)),
             'email', u.email,
             'tg_username', u.raw_user_meta_data ->> 'tg_username'
           ) order by f.created_at desc)
    from (select * from public.feedback order by created_at desc limit 300) f
    left join auth.users u on u.id = f.user_id
  ), '[]'::jsonb);
end;
$$;

-- 4. Отметить решённым или вернуть в новые
create or replace function public.admin_feedback_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if p_status not in ('new', 'done') then
    raise exception 'Неизвестный статус' using errcode = '22023';
  end if;
  update public.feedback set status = p_status where id = p_id;
end;
$$;

revoke execute on function public.send_feedback(text, text, text, text)  from public, anon;
revoke execute on function public.admin_feedback()                       from public, anon;
revoke execute on function public.admin_feedback_status(uuid, text)      from public, anon;
grant  execute on function public.send_feedback(text, text, text, text)  to authenticated;
grant  execute on function public.admin_feedback()                       to authenticated;
grant  execute on function public.admin_feedback_status(uuid, text)      to authenticated;
