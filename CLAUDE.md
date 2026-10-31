# CLAUDE.md — Синергия PM

Контекст для новых сессий Claude. Отвечай пользователю по-русски.

## Что это

Планнер задач: `index.html` (разметка), `style.css` (стили) и скрипты в `js/` — ванильный JS без сборки и фреймворков.
Бэкенд — Supabase (таблицы `tasks` и `projects`, Auth, Realtime). Задачи также добавляет Telegram-бот.
Тема хранится в localStorage (`spm2_theme`). Старые проекты из localStorage (`spm2_projects`) при входе
один раз переносятся в таблицу `projects` с теми же id, копия остаётся в `spm2_projects_backup`.

- Сайт: https://soul1n-max.github.io/ (репозиторий `Soul1n-max/soul1n-max.github.io`, до 2026-10-29 назывался
  `sinergia-planner`; GitHub Pages из ветки `main`, корень). Старый адрес `/sinergia-planner/` ведёт сюда через
  отдельный репозиторий-переадресацию `Soul1n-max/sinergia-planner`. Git на компьютере пользователя не установлен —
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
- «Забыли пароль?» (`auth.js`): `resetPasswordForEmail` → письмо по шаблону Supabase «Reset Password» (ссылка и код
  `{{ .Token }}`). Код вводится на сайте (`verifyOtp` type `recovery`), ссылка возвращает с `#…type=recovery`.
  Пока стоит флаг `passwordRecovery` (`core.js`), планнер не открывается — его откроет `USER_UPDATED` после нового пароля.

## Таблица `tasks` (Supabase)

`id` (uuid), `text` (не пустой — `supabase/10_task_text_check.sql`), `cat` (project | contact | remind | urgent | personal), `note`, `done`,
`created_at`, `due_date` (YYYY-MM-DD), `due_time` (HH:MM:SS), `project_id`,
`recur` (daily | weekdays | weekly | monthly | yearly | days:N | weeks:N | months:N, N от 2 до 365),
`subtasks` (jsonb, массив `{id, text, done}`, до 50), `done_at`, `user_id` (Telegram ID из `app_metadata.telegram_id`),
`reminded_for` (момент, о котором бот уже напомнил). `files` (jsonb, массив `{id, name, path, size, type}`, до 10) — файлы задачи, `supabase/09_task_files.sql`. `subtasks` и проверки `recur` добавляет `supabase/07_subtasks_backup.sql`.
Следующий повтор считают `nextDue()` (`core.js`) и `next_due()` (`phrase.py` бота) — одинаково.

Копия задач раз в неделю: `pg_cron` по воскресеньям в 20:00 МСК вызывает `request_weekly_backup()`
(`07_subtasks_backup.sql`) → бот на `/weekly-backup` (секрет — hmac(токен бота, 'weekly-backup')) присылает каждому
файл в формате кнопки «Скачать копию».

Напоминания по времени шлёт сама база: `pg_cron` раз в минуту вызывает `send_task_reminders()`
(`supabase/04_reminders.sql`, текущая версия функции — в `11_timezone.sql`), токен бота — в Supabase Vault (`telegram_bot_token`),
время задач — местное время владельца (`user_settings.tz`, без записи — московское).
Под напоминанием кнопки «Выполнено», «+15 мин», «+1 час», «Завтра» (`callback_data` вида `r:…:id`) —
их нажатия обрабатывает бот (`handle_task_callback` в `bot_webhook.py`), отложенное напоминание приходит снова.

## Таблица `user_settings` (Supabase)

`user_id` (Telegram ID, ключ), `tz` (часовой пояс IANA, по умолчанию `Europe/Moscow`), `updated_at`. Схема, RLS
`own settings` и проверка пояса — `supabase/11_timezone.sql`. Пояс сайт определяет сам по устройству
(`syncTimezone()` в `data.js` после загрузки задач, пишет только если поменялся) и показывает в окне аватара
(«Екатеринбург · МСК+2», `mskDiff()` в `core.js`). Время задач — местное время владельца: по нему
`send_task_reminders()` шлёт напоминания, а бот считает «сегодня», «завтра» и «+15 мин» (`user_tz()` в `bot_webhook.py`).

## Таблица `projects` (Supabase)

`id` (uuid), `user_id` (Telegram ID), `name`, `color`, `created_at`. Схема и RLS-политика `own projects`
(то же правило, что у `tasks`) — в `supabase/projects.sql`. При удалении проекта сайт сам обнуляет
`project_id` у его задач.

## Структура сайта

Скрипты — обычные `<script src>` (не модули) в конце `index.html`, порядок важен: у них общие глобальные
переменные и функции, и код, который выполняется сразу при загрузке файла, может вызывать только то,
что объявлено в нём самом или в файлах выше. Порядок:
`core.js` (Supabase, иконки, константы, состояние, утилиты) → `phrase.js` (ввод фразой) → `data.js` (проекты и задачи в базе) →
`render.js` (карточка задачи, списки, календарь, проекты, сетка месяца, перетаскивание) →
`fields.js` (свои поля выбора, выбор проекта и цвета) → `ui.js` (вкладки, тема, быстрое добавление) →
`auth.js` (вход по почте и через Telegram) → `avatar.js` (аватар) → `onboarding.js` → `main.js` (`init()`) → `demo.js` (режим `?demo`, подменяет функции базы).

- `style.css`: токены в `:root`, тёмная тема через `prefers-color-scheme` и `[data-theme="dark"]`;
  мобильная вёрстка — `@media (max-width: 860px)` (боковое меню → верхняя шапка + нижняя панель вкладок).
- Разметка: `.sidebar` (бренд, `.tabs-nav`, проекты, синхронизация/тема/выход) и `.main`
  с вкладками `#tab-tasks`, `#tab-calendar`, `#tab-projects`; `#auth-overlay` — экран входа.
- JS: `renderAll()` → `renderMeta()` + рендер активной вкладки; `makeTaskEl()` — карточка задачи;
  `byDue()` — сортировка по дате и времени; `subscribeRealtime()` запускается один раз.
- Свои поля выбора: `<select>` и `<input type="date|time">` с классом `ui-field` и `data-label` скрыты,
  `uiField(el)` ставит рядом кнопку-«пилюлю» и своё всплывающее окно (`openPop`). Значение по-прежнему
  читается и пишется через `el.value` (запись перехвачена, кнопка обновляется сама). Новые поля в карточке
  задачи подключаются в `makeTaskEl()`. Системные select/date/time в интерфейсе не используем.
- Однострочные поля для текста (задача, название в правке, название проекта и его переименование) —
  `<textarea class="one-line" rows="1" wrap="off">` + `singleLine(el, onEnter)` из `core.js`, а не `<input>`:
  менеджеры паролей Chrome/Яндекса подставляют сохранённые почту и пароль в любые `<input>` и не слушают
  `autocomplete="off"`. Новые текстовые поля вне формы входа делай так же.
- Календарь на главной: `#month-card` (`renderMonthCard()`, общая сетка `monthGridHTML()` с окном выбора даты).
  Нажатие на день — `setDayFilter()`: список показывает только этот день, поле «Дата» ставится на него.
  Задачи мышью перетаскиваются на любой элемент с `data-drop="YYYY-MM-DD"` → `moveTask()`.
- SEO и превью ссылок — в `<head>`: `description`, `canonical`, Open Graph и Twitter-карточка с картинкой
  `img/og-image.png` (1200×630, Иван на красном), иконки `img/favicon-*.png` и `img/apple-touch-icon.png`, карта сайта
  `sitemap.xml` и `robots.txt` (сайт в корне домена, поэтому поисковики их читают).
- Копия задач: кнопка `#btn-backup` в боковом меню (`ui.js`, раздел BACKUP) — «Скачать копию» (.json в полях базы),
  «Скачать таблицу» (.csv через «;» с BOM для Excel) и «Загрузить копию»: `backupRows()` проверяет каждую строку,
  `importBackup()` в `data.js` добавляет только задачи и проекты с новыми id, существующие не меняет.
- Ввод фразой: `parsePhrase()` в `phrase.js` вырезает из текста дату, время, тип (#срочно), проект (#Название) и повтор;
  `paintPhrasePreview()` в `ui.js` показывает найденное под полем (`#qa-preview`), `applyPhrase()` переносит его в поля.
  Бот разбирает фразы по тем же правилам (`phrase.py`) — правь оба файла вместе.
- Выполнение подтверждается: «Да, выполнена» появляется прямо под галочкой (`.done-confirm` с первой колонки).
- Удаление задачи — сразу, без вопроса. `deleteTask()` возвращает удалённую строку,
  `showDeleteToast()` (`drag.js`) показывает «Отменить», `restoreTask()` вставляет её обратно с тем же id.
  То же уведомление (`showUndoToast`) отменяет перенос задачи на другой день.
- Файлы задачи: закрытый бакет Storage `task-files`, путь `<telegram_id>/<id задачи>/<id файла>.<расш>`, до 10 МБ
  и 10 файлов. В карточке — плашки `.task-files` (нажатие скачивает через `openTaskFile()`), в форме «Изменить» —
  «Прикрепить файл» и «Убрать» (сохраняются сразу, `uploadTaskFile()` / `removeTaskFile()` в `data.js`). Файлы удалённой
  задачи стирает `purgeFiles()`, когда уведомление «Отменить» ушло; у повторов файлы общие. Пока открыта форма
  «Изменить», обновления из базы не перерисовывают список (`renderDeferred`). Бот о файлах пока не знает.
- Аватар (`avatar.js`): кнопка `#btn-avatar` внизу бокового меню (на телефоне — кружок в шапке, «Выйти» там переезжает
  в окно аватара). Выбор в `user_metadata.avatar`: `tg` (фото `tg_photo` — его и `tg_name` запоминает `rememberTgProfile()`
  при входе или привязке через Telegram), `ivan:<образ>` (`img/avatars/*.webp`), `photo:<время>` (своё фото 256×256 JPEG
  в публичном бакете Storage `avatars/<auth.uid()>/avatar.jpg`, бакет и политики — `supabase/08_avatars.sql`), `letter`.
  Имя и фамилию меняют карандашом в окне аватара (`user_metadata.full_name`; пустое — имя из Telegram или начало почты), под именем — почта, у аккаунтов из Telegram — `Telegram @ник` (`tg_username`).
  Это только оформление, для доступа к данным `user_metadata` по-прежнему не используем.
- Подзадачи: список в карточке (`.subtasks`, отмечаются сразу) и черновик в форме «Изменить» (`.sub-edit`), сохраняется кнопкой «Сохранить».
- ID элементов используются в JS — при правке вёрстки не переименовывай их.
- Встроенные обработчики (`onclick="…"`, `onsubmit="…"`) и `<script>` без `src` CSP запрещает — события
  вешаем через `addEventListener`. Формы ничего не отправляют: `submit` гасится один раз в `core.js`.

## Дизайн-система

- Шрифты: Unbounded (заголовки), Onest (текст) — Google Fonts.
- Гамма Синергии: красный `#ED131C` (акцент), чёрный `#1C1C1C` (текст и боковое меню), белый `#FFFFFF`.
  Светлая тема: фон `#F5F5F5`, панели меню `#1C1C1C` / `#2A2A2A` / `#3A3A3A`; красный на тёмном фоне — `--side-accent`.
- Категории: проект `#1C1C1C`, контакт `#0369A1`, напомнить `#B45309`, срочно `#B91C1C`, личное `#047857`
  (каждая с мягким фоном, см. `--b-*`).
- Маскот Иван (носорог Синергии): образы в `img/ivan/*.webp`, взяты из Figma-файла Alex «Маскот ИВАН».
  Карточка в шапке (`renderMascot()` в `render.js`) выбирает образ и фразу по задачам на сегодня; после каждой
  выполненной задачи образ меняется по кругу `MASCOT_CHEERS`, когда всё на сегодня закрыто — кубок и показывает серию дней подряд (`calcStreak()` по `done_at`, новых таблиц нет).
- Экран входа: Иван покачивается с тенью на «полу»; на компьютере слегка наклоняется за курсором (`--tx`/`--ty` на `.auth-hero-head`, ставит `auth.js`). Без курсора и при «уменьшить движение» — без наклона.
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
- В `<head>` стоит Content-Security-Policy (meta), в `script-src` нет `'unsafe-inline'`: новый внешний адрес (CDN, API, шрифты) нужно вписать
  в неё, иначе браузер его заблокирует. supabase-js подключён точной версией с `integrity` — менять
  версию только вместе с хешем. Цвет проекта проходит через `safeColor()` (он попадает в `style`).
  Проверка базы — `supabase/05_security_check.sql`.
