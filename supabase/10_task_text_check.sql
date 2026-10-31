-- Запретить задачи без текста.
-- Пустые задачи создавал бот, когда ему присылали стикер, фото или голосовое: текста нет,
-- а сообщение всё равно сохранялось как задача без даты («Не рассортированные»).
-- Бот это больше не делает; здесь — запрет на уровне базы, чтобы пустая задача не появилась ни откуда.
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.

-- 1. Убираем уже появившиеся пустые задачи (в них нет ни текста, ни шагов, ни файлов)
delete from public.tasks
where btrim(coalesce(text, '')) = ''
  and coalesce(jsonb_array_length(subtasks), 0) = 0
  and coalesce(jsonb_array_length(files), 0) = 0;

-- Если у пустой задачи были шаги или файлы — не удаляем, а даём ей название
update public.tasks set text = 'Без названия'
where btrim(coalesce(text, '')) = '';

-- 2. Запрет: текст задачи не может быть пустым
alter table public.tasks drop constraint if exists tasks_text_not_empty;
alter table public.tasks add constraint tasks_text_not_empty
  check (text is not null and btrim(text) <> '');

-- Проверка: должно вернуть 0
select count(*) as empty_tasks from public.tasks where btrim(coalesce(text, '')) = '';
