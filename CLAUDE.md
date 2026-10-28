# CLAUDE.md — Синергия PM

Контекст для новых сессий Claude. Отвечай пользователю по-русски.

## Что это

Планнер задач в одном файле `index.html`: HTML + CSS + ванильный JS, без сборки и фреймворков.
Бэкенд — Supabase (таблицы `tasks` и `projects`, Auth, Realtime). Задачи также добавляет Telegram-бот.
Тема хранится в localStorage (`spm2_theme`). Старые проекты из localStorage (`spm2_projects`) при входе
один раз переносятся в таблицу `projects` с теми же id, копия остаётся в `spm2_projects_backup`.

- Сайт: https://soul1n-max.github.io/sinergia-planner/ (репозиторий `Soul1n-max/sinergia-planner`,
  GitHub Pages из ветки `main`, корень). Git на компьютере пользователя не установлен —
  изменения выкладываются через сайт GitHub (Upload files / редактор).
- Бот: приватный репозиторий `Soul1n-max/synergia-planner`, Render-сервис `synergia-planner-1`
  (`gunicorn bot_webhook:flask_app`, webhook-режим). Ключи берёт из переменных Render
  `SUPABASE_KEY` (секретный `sb_secret_…`) и `BOT_TOKEN`.
- Сайт грузит задачи только при привязанном Telegram ID (`app_metadata.telegram_id`, ставит
  функция `link_telegram` по коду из команды бота `/link`, см. `supabase/README.md`);
  демо-задачи при первом входе не создаются.
- Вход через Telegram: окно `oauth.telegram.org` (бот @synergyplanerbot, домен задан в BotFather
  `/setdomain`), подпись проверяет бот на `/site-login` и выдаёт одноразовый токен входа,
  см. `supabase/README.md`. Почта с паролем — запасной вход. Аккаунт, вошедший по почте, привязывает
  Telegram тем же окном: бот на `/site-link` выдаёт код как по `/link`, сайт применяет его через `link_telegram`.

## Таблица `tasks` (Supabase)

`id` (uuid), `text`, `cat` (project | contact | remind | urgent | personal), `note`, `done`,
`created_at`, `due_date` (YYYY-MM-DD), `due_time` (HH:MM:SS), `project_id`,
`recur` (daily | weekly | monthly), `done_at`, `user_id` (Telegram ID из `app_metadata.telegram_id`),
`reminded_for` (момент, о котором бот уже напомнил).

Напоминания по времени шлёт сама база: `pg_cron` раз в минуту вызывает `send_task_reminders()`
(`supabase/04_reminders.sql`), токен бота — в Supabase Vault (`telegram_bot_token`), время задач московское.
Под напоминанием кнопки «Выполнено», «+15 мин», «+1 час», «Завтра» (`callback_data` вида `r:…:id`) —
их нажатия обрабатывает бот (`handle_task_callback` в `bot_webhook.py`), отложенное напоминание приходит снова.

## Таблица `projects` (Supabase)

`id` (uuid), `user_id` (Telegram ID), `name`, `color`, `created_at`. Схема и RLS-политика `own projects`
(то же правило, что у `tasks`) — в `supabase/projects.sql`. При удалении проекта сайт сам обнуляет
`project_id` у его задач.

## Структура `index.html`

- `<style>`: токены в `:root`, тёмная тема через `prefers-color-scheme` и `[data-theme="dark"]`;
  мобильная вёрстка — `@media (max-width: 860px)` (боковое меню → верхняя шапка + нижняя панель вкладок).
- Разметка: `.sidebar` (бренд, `.tabs-nav`, проекты, синхронизация/тема/выход) и `.main`
  с вкладками `#tab-tasks`, `#tab-calendar`, `#tab-projects`; `#auth-overlay` — экран входа.
- JS: `renderAll()` → `renderMeta()` + рендер активной вкладки; `makeTaskEl()` — карточка задачи;
  `byDue()` — сортировка по дате и времени; `subscribeRealtime()` запускается один раз.
- Свои поля выбора: `<select>` и `<input type="date|time">` с классом `ui-field` и `data-label` скрыты,
  `uiField(el)` ставит рядом кнопку-«пилюлю» и своё всплывающее окно (`openPop`). Значение по-прежнему
  читается и пишется через `el.value` (запись перехвачена, кнопка обновляется сама). Новые поля в карточке
  задачи подключаются в `makeTaskEl()`. Системные select/date/time в интерфейсе не используем.
- Календарь на главной: `#month-card` (`renderMonthCard()`, общая сетка `monthGridHTML()` с окном выбора даты).
  Нажатие на день — `setDayFilter()`: список показывает только этот день, поле «Дата» ставится на него.
  Задачи мышью перетаскиваются на любой элемент с `data-drop="YYYY-MM-DD"` → `moveTask()`.
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
- В `<head>` стоит Content-Security-Policy (meta): новый внешний адрес (CDN, API, шрифты) нужно вписать
  в неё, иначе браузер его заблокирует. supabase-js подключён точной версией с `integrity` — менять
  версию только вместе с хешем. Цвет проекта проходит через `safeColor()` (он попадает в `style`).
  Проверка базы — `supabase/05_security_check.sql`.
