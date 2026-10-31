# Привязка Telegram по коду от бота

Раньше сайт и RLS доверяли `user_metadata.telegram_id`. Это поле пользователь меняет сам
(`sb.auth.updateUser({ data: { telegram_id: … } })`), поэтому мог вписать чужой ID и читать
чужие задачи. Теперь ID хранится в `app_metadata`: его пишет только функция `link_telegram`
в базе, и только по одноразовому коду, который выдал бот этому Telegram-аккаунту.

## Как это работает

1. Пользователь пишет боту `/link`. Бот секретным ключом вызывает
   `issue_telegram_link_code(telegram_id)` и отвечает кодом из 8 символов (живёт 10 минут).
2. На сайте пользователь вводит код. Сайт вызывает `link_telegram(code)`: функция проверяет
   код, удаляет его и записывает Telegram ID в `app_metadata` текущего аккаунта.
3. Сайт обновляет сессию, в новом JWT есть `app_metadata.telegram_id`, по нему RLS отдаёт задачи.

## Порядок выкладки

1. Supabase → SQL Editor: выполнить `01_telegram_link.sql` (старый доступ пока работает).
2. Бот: добавить команду `/link` (ниже) и задеплоить на Render.
3. Сайт: влить PR в `main`. После входа сайт попросит код — отправить боту `/link` и ввести его.
4. Supabase → SQL Editor: выполнить `02_rls_app_metadata.sql`. С этого момента
   `user_metadata` ничего не открывает.

## Команда `/link` для бота

Бот уже ходит в Supabase секретным ключом, нужен один вызов RPC. Пример для
python-telegram-bot (v20+); переменную клиента назовите так, как она называется в боте:

```python
async def link_cmd(update, context):
    tg_id = update.effective_user.id
    code = supabase.rpc("issue_telegram_link_code", {"p_telegram_id": tg_id}).execute().data
    await update.message.reply_text(
        f"Код для сайта: {code}\n"
        "Введите его на сайте в течение 10 минут. Никому не пересылайте."
    )

application.add_handler(CommandHandler("link", link_cmd))
```

Для pyTelegramBotAPI то же самое через `@bot.message_handler(commands=["link"])`
и `bot.reply_to(message, …)`, Telegram ID — `message.from_user.id`.

# Вход через Telegram

Кнопка «Войти через Telegram» открывает окно входа Telegram (`oauth.telegram.org`, как
Telegram Login Widget; окно открывает сам сайт, без скрипта `telegram-widget.js`). Окно возвращает
данные пользователя, подписанные токеном бота. Сайт отправляет их на `/site-login` бота
(Render). Бот проверяет подпись (HMAC-SHA256 с ключом sha256(токен бота), не старше часа),
находит аккаунт с этим Telegram ID в `app_metadata` функцией `telegram_login_email`
из `03_telegram_login.sql` или создаёт новый со служебной почтой `tg<ID>@soul1n-max.github.io`
и сразу проставленным `app_metadata.telegram_id`, и отдаёт одноразовый токен входа
(`auth.admin.generate_link`, письмо не уходит). Сайт входит через
`verifyOtp({ token_hash, type: 'magiclink' })`. `GET /site-login` отдаёт `bot_id`: сайт берёт
его при показе экрана входа, заодно будя сервер на Render.

Порядок: выполнить `03_telegram_login.sql` → в @BotFather `/setdomain` для бота указать
`soul1n-max.github.io` → задеплоить бота → влить сайт.

# Напоминания по времени

Если у задачи есть дата и время, в этот момент бот присылает её в Telegram (с заметкой и кнопкой
«Открыть планер»). Всё работает внутри Supabase, `04_reminders.sql`: расширение `pg_cron` раз
в минуту вызывает `send_task_reminders()`, функция находит невыполненные задачи, чьё время
наступило в последние 30 минут, и шлёт сообщение через `pg_net` прямо в Telegram Bot API.
Бот на Render для этого не нужен, поэтому напоминание приходит вовремя, даже когда он спит.
GitHub Actions по расписанию не подошёл: запуски там опаздывают на 5–30 минут, а в репозитории
без коммитов 60 дней расписание отключается.

Колонка `tasks.reminded_for` хранит момент, о котором уже напомнили: повторно бот не пишет,
а если дату или время поменять, напомнит в новое время. Задачи, созданные уже после своего
времени, не напоминаются. Время считается московским (`reminder_tz` в функции).
Токен бота лежит в Supabase Vault под именем `telegram_bot_token`, в коде его нет.

Порядок: выполнить `04_reminders.sql` → в SQL Editor выполнить
`select vault.create_secret('ТОКЕН_БОТА', 'telegram_bot_token');` с токеном из Render (`BOT_TOKEN`).
Проверка: `select * from cron.job_run_details order by start_time desc limit 5;` и ответы Telegram
в `net._http_response`.

# Проверка и усиление безопасности

`05_security_check.sql` только читает: показывает таблицы без RLS, все политики, функции, которые
может вызвать сайт, права гостя (anon) и публичные бакеты. Ожидаемый результат описан в начале файла.
`06_hardening.sql` убирает у гостя права на `tasks` и `projects`, ограничивает цвет проекта видом
`#RRGGBB` и длину текста задачи и заметки, раз в сутки чистит просроченные коды привязки.
Порядок: `05` → `06` → снова `05` (строк «Права anon на таблицу» больше нет).

## Восстановление пароля

Кнопка «Забыли пароль?» на сайте вызывает `resetPasswordForEmail`. Письмо — шаблон
**Authentication → Emails → Reset Password**. Чтобы на сайте можно было ввести код из письма
(удобно, если письмо открыто на другом устройстве), в шаблоне должен быть `{{ .Token }}`:

```html
<h2>Восстановление пароля</h2>
<p>Код для нового пароля: <b>{{ .Token }}</b></p>
<p>Или нажмите ссылку: <a href="{{ .ConfirmationURL }}">задать новый пароль</a></p>
<p>Если вы не просили сменить пароль, просто проигнорируйте это письмо.</p>
```

Ссылка возвращает на адрес сайта — он должен быть в **Authentication → URL Configuration → Redirect URLs**.

# Подзадачи, новые повторы и копия задач раз в неделю

`07_subtasks_backup.sql` добавляет в `tasks` столбец `subtasks` (массив `{id, text, done}`), проверки вида
`subtasks` и `recur` (новые повторы: `weekdays`, `yearly`, `days:N`, `weeks:N`, `months:N`) и задание `pg_cron`
`weekly-backup`: по воскресеньям в 17:00 UTC (20:00 МСК) база вызывает `/weekly-backup` бота, бот присылает
каждому пользователю с задачами файл копии. Заголовок `X-Cron-Secret` = hmac-sha256(токен бота, `weekly-backup`),
токен база берёт из Vault (`telegram_bot_token`).

Порядок: выполнить `07_subtasks_backup.sql` → выложить бота → влить сайт.
