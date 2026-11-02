-- Время окончания задачи: «Созвон с 10:00 до 12:00».
-- В календаре (День / 4 дня / Неделя) задача тогда занимает весь промежуток, а не полчаса.
-- Напоминание по-прежнему приходит ко времени начала (due_time).
-- Запускать в Supabase → SQL Editor ДО слияния PR сайта и бота. Повторный запуск безопасен.

-- 1. Новый столбец: местное время окончания, как due_time (HH:MM:SS). Пусто — окончания нет.
alter table public.tasks add column if not exists due_end time;

-- 2. Окончание бывает только у задачи со временем начала и только позже него (в пределах одного дня)
alter table public.tasks drop constraint if exists tasks_due_end_check;
alter table public.tasks add constraint tasks_due_end_check
  check (due_end is null or (due_time is not null and due_end > due_time));

-- Проверка: должно вернуть одну строку due_end | time without time zone
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'tasks' and column_name = 'due_end';
