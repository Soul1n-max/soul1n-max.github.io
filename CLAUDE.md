# CLAUDE.md — Синергия PM

Контекст для новых сессий Claude. Отвечай пользователю по-русски.

## Что это

Планнер задач в одном файле `index.html`: HTML + CSS + ванильный JS, без сборки и фреймворков.
Бэкенд — Supabase (таблица `tasks`, Auth, Realtime). Задачи также добавляет Telegram-бот.
Проекты хранятся в localStorage (`spm2_projects`), тема — в `spm2_theme`.

- Сайт: https://soul1n-max.github.io/sinergia-planner/ (репозиторий `Soul1n-max/sinergia-planner`,
  GitHub Pages из ветки `main`, корень). Git на компьютере пользователя не установлен —
  изменения выкладываются через сайт GitHub (Upload files / редактор).
- Бот: приватный репозиторий `Soul1n-max/synergia-planner`, Render-сервис `synergia-planner-1`
  (`gunicorn bot_webhook:flask_app`, webhook-режим). Ключи берёт из переменных Render
  `SUPABASE_KEY` (секретный `sb_secret_…`) и `BOT_TOKEN`.
- Сайт грузит задачи только при привязанном Telegram ID (`app_metadata.telegram_id`, ставит
  функция `link_telegram` по коду из команды бота `/link`, см. `supabase/README.md`);
  демо-задачи при первом входе не создаются (`seedDemo()` не вызывается).

## Таблица `tasks` (Supabase)

`id` (uuid), `text`, `cat` (project | contact | remind | urgent | personal), `note`, `done`,
`created_at`, `due_date` (YYYY-MM-DD), `due_time` (HH:MM:SS), `project_id`,
`recur` (daily | weekly | monthly), `done_at`, `user_id` (Telegram ID из `app_metadata.telegram_id`).

## Структура `index.html`

- `<style>`: токены в `:root`, тёмная тема через `prefers-color-scheme` и `[data-theme="dark"]`;
  мобильная вёрстка — `@media (max-width: 860px)` (боковое меню → верхняя шапка + нижняя панель вкладок).
- Разметка: `.sidebar` (бренд, `.tabs-nav`, проекты, синхронизация/тема/выход) и `.main`
  с вкладками `#tab-tasks`, `#tab-calendar`, `#tab-projects`; `#auth-overlay` — экран входа.
- JS: `renderAll()` → `renderMeta()` + рендер активной вкладки; `makeTaskEl()` — карточка задачи;
  `byDue()` — сортировка по дате и времени; `subscribeRealtime()` запускается один раз.
- ID элементов используются в JS — при правке вёрстки не переименовывай их.

## Дизайн-система

- Шрифты: Unbounded (заголовки), Onest (текст) — Google Fonts.
- Светлая тема: фон `#F5F4FA`, текст `#17142B`, акцент `#6C58E8`, лаванда `#C4B8FF`,
  тёмные панели `#1E1838` / `#2E2650` / `#3A3160`.
- Категории: проект `#4B3BC4`, контакт `#0369A1`, напомнить `#B45309`, срочно `#B91C1C`, личное `#047857`
  (каждая с мягким фоном, см. `--b-*`).
- Без эмодзи — только инлайн SVG-иконки (stroke). Кнопки ≥ 44px. Скругления 12–22px.
- Макет на холсте: https://claude.ai/artifact/RCoR3bda6qb7VdLPg752sM

## Правила

- Сохраняй всю логику Supabase и авторизации при изменении дизайна.
- Публичный ключ Supabase во фронтенде допустим; безопасность — через RLS на таблице `tasks`:
  политика `own tasks` (authenticated) пускает только к строкам, где
  `user_id::text = auth.jwt() -> 'app_metadata' ->> 'telegram_id'` (после `supabase/02_rls_app_metadata.sql`;
  до него — старая проверка по `user_metadata`, которую пользователь может подделать).
  Никогда не доверяй `user_metadata` в RLS и в коде. Legacy-ключи (anon/service_role)
  и старый HS256-секрет JWT отключены.
- Никогда не вписывай секретный ключ или токен бота в код и не выводи их в логи.
