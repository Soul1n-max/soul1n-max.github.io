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
Telegram Login Widget) через `Telegram.Login.auth` из `telegram-widget.js`. Окно возвращает
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
