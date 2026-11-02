-- Здоровье системы для админа: работают ли задачи по расписанию (напоминания, утренняя сводка, копия задач,
-- «будильник» бота), сколько напоминаний и сводок ушло, есть ли застрявшие, ответы на запросы базы
-- и сколько места занимают база и файлы. На сайте — пункт «Здоровье системы» в окне аватара (js/admin.js).
-- Только числа и служебные строки: ни текстов задач, ни почт, ни имён функция не отдаёт.
-- Кто админ — та же таблица admins из 13_admin_stats.sql (её нужно запустить раньше).
--
-- Запустить один раз в Supabase → SQL Editor (можно повторно).

-- 1. Сама проверка. Каждая часть в своём блоке: если чего-то нет (например, pg_net), остальное всё равно придёт
create or replace function public.admin_health()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  default_tz constant text     := 'Europe/Moscow';
  catch_up   constant interval := interval '30 minutes';  -- как в send_task_reminders()
  res  jsonb := jsonb_build_object('now', now());
  part jsonb;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  -- Задачи по расписанию (pg_cron): последний запуск и сбои за сутки
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'name',      j.jobname,
             'schedule',  j.schedule,
             'active',    j.active,
             'last_at',   l.start_time,
             'last_ok',   l.status = 'succeeded',
             'last_msg',  case when l.status <> 'succeeded' then left(l.return_message, 200) end,
             'runs_day',  c.runs,
             'fails_day', c.fails
           ) order by j.jobname), '[]'::jsonb)
      into part
    from cron.job j
    left join lateral (
      select d.start_time, d.status, d.return_message
      from cron.job_run_details d
      where d.jobid = j.jobid and d.status in ('succeeded', 'failed')
      order by d.start_time desc limit 1
    ) l on true
    left join lateral (
      select count(*) as runs, count(*) filter (where d.status = 'failed') as fails
      from cron.job_run_details d
      where d.jobid = j.jobid and d.start_time > now() - interval '1 day'
    ) c on true;
    res := res || jsonb_build_object('jobs', part);
  exception when others then
    res := res || jsonb_build_object('jobs_error', left(sqlerrm, 200));
  end;

  -- Напоминания: сколько ушло за сутки и сколько застряло (время прошло больше 5 минут назад, а не отправлено)
  begin
    select jsonb_build_object(
      'sent_day', (select count(*) from public.tasks where reminded_for > now() - interval '1 day'),
      'stuck', (
        select count(*)
        from public.tasks k
        left join public.user_settings s on s.user_id = k.user_id
        cross join lateral (
          select (k.due_date + k.due_time) at time zone coalesce(s.tz, default_tz) as due_at
        ) d
        where k.done = false and k.due_time is not null and k.user_id is not null
          and k.due_date between (now() at time zone 'UTC')::date - 2 and (now() at time zone 'UTC')::date + 1
          and d.due_at <= now() - interval '5 minutes'
          and d.due_at >  now() - catch_up
          and d.due_at >  k.created_at
          and k.reminded_for is distinct from d.due_at),
      'token', exists (select 1 from vault.decrypted_secrets where name = 'telegram_bot_token')
    ) into part;
    res := res || jsonb_build_object('reminders', part);
  exception when others then
    res := res || jsonb_build_object('reminders_error', left(sqlerrm, 200));
  end;

  -- Утренняя сводка: у скольких включена, скольким ушла сегодня (по их местной дате) и за 7 дней
  begin
    select jsonb_build_object(
      'enabled',   count(*) filter (where s.morning),
      'sent_today', count(*) filter (where s.morning_sent_on = (now() at time zone s.tz)::date),
      'sent_week',  count(*) filter (where s.morning_sent_on > (now() at time zone s.tz)::date - 7)
    ) into part
    from public.user_settings s;
    res := res || jsonb_build_object('morning', part);
  exception when others then
    res := res || jsonb_build_object('morning_error', left(sqlerrm, 200));
  end;

  -- Ответы на запросы базы к Telegram и боту за последние часы (pg_net хранит их около 6 часов).
  -- Берём только код ответа и короткую причину ошибки Telegram, содержимое ответов не отдаём
  begin
    select jsonb_build_object(
      'total',  count(*),
      'failed', count(*) filter (where r.timed_out or r.status_code is null or r.status_code >= 400),
      'since',  min(r.created),
      'reasons', (
        select coalesce(jsonb_agg(jsonb_build_object('reason', x.reason, 'n', x.n) order by x.n desc), '[]'::jsonb)
        from (
          select coalesce(
                   case when e.timed_out then 'Нет ответа (таймаут)' end,
                   left(e.error_msg, 120),
                   substring(e.content from '"description":"([^"]{1,120})"'),
                   'Код ' || e.status_code) as reason,
                 count(*) as n
          from net._http_response e
          where e.timed_out or e.status_code is null or e.status_code >= 400
          group by 1 order by 2 desc limit 5
        ) x)
    ) into part
    from net._http_response r;
    res := res || jsonb_build_object('requests', part);
  exception when others then
    res := res || jsonb_build_object('requests_error', left(sqlerrm, 200));
  end;

  -- Место: база целиком и файлы по бакетам (задачи, аватары)
  begin
    select jsonb_build_object(
      'db_bytes', pg_database_size(current_database()),
      'buckets', (
        select coalesce(jsonb_agg(jsonb_build_object('bucket', b.bucket_id, 'files', b.n, 'bytes', b.bytes) order by b.bucket_id), '[]'::jsonb)
        from (
          select o.bucket_id, count(*) as n, coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
          from storage.objects o group by o.bucket_id
        ) b)
    ) into part;
    res := res || jsonb_build_object('storage', part);
  exception when others then
    res := res || jsonb_build_object('storage_error', left(sqlerrm, 200));
  end;

  return res;
end;
$$;

revoke execute on function public.admin_health() from public, anon;
grant  execute on function public.admin_health() to authenticated;

-- 2. История запусков pg_cron растёт на ~4 000 строк в сутки (три задачи раз в минуту).
--    Раз в сутки удаляем всё старше 7 дней, чтобы проверка выше оставалась быстрой
select cron.unschedule('cleanup-cron-history')
where exists (select 1 from cron.job where jobname = 'cleanup-cron-history');
select cron.schedule('cleanup-cron-history', '41 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- Проверка: должна вернуть строку с jobs, reminders, morning, requests, storage (без *_error)
-- select public.admin_health();  -- в SQL Editor вернёт «Нет доступа»: там вы не вошли как админ
select jobname, schedule, active from cron.job order by jobname;
