// Вход: почта с паролем и Telegram

// ═══ AUTH EVENT LISTENERS ═══
document.getElementById('switch-to-register').addEventListener('click', () => { clearAuthError('auth-error-login'); switchAuthForm('register'); });
document.getElementById('switch-to-login').addEventListener('click',    () => { clearAuthError('auth-error-register'); switchAuthForm('login'); });
document.getElementById('btn-to-login-after-reg').addEventListener('click', () => switchAuthForm('login'));

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  clearAuthError('auth-error-login');
  if (!email || !pass) { showAuthError('auth-error-login','Заполните email и пароль'); return; }
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Вход…';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Войти';
  if (error) { showAuthError('auth-error-login', error.message === 'Email not confirmed' ? 'Подтвердите email (проверьте почту)' : error.message); return; }
  await loadTasks(); renderAll();
});

document.getElementById('btn-register').addEventListener('click', async () => {
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  clearAuthError('auth-error-register');
  if (!email || !pass) { showAuthError('auth-error-register','Заполните email и пароль'); return; }
  if (pass.length < 8) { showAuthError('auth-error-register','Пароль минимум 8 символов'); return; }
  const btn = document.getElementById('btn-register');
  btn.disabled = true; btn.textContent = 'Создание…';
  // Ссылка из письма ведёт обратно на этот сайт, а не на адрес по умолчанию
  const { error } = await sb.auth.signUp({ email, password: pass,
    options: { emailRedirectTo: location.origin + location.pathname } });
  btn.disabled = false; btn.textContent = 'Создать аккаунт';
  if (error) { showAuthError('auth-error-register', error.message); return; }
  document.getElementById('confirm-email').textContent = email;
  document.getElementById('login-email').value = email;
  switchAuthForm('confirm');
  document.getElementById('confirm-code').focus();
});

document.getElementById('btn-confirm-code').addEventListener('click', async () => {
  const email = document.getElementById('confirm-email').textContent;
  const token = document.getElementById('confirm-code').value.replace(/\s/g, '');
  clearAuthError('auth-error-confirm');
  if (!/^\d{6,10}$/.test(token)) { showAuthError('auth-error-confirm', 'Введите цифры из письма'); return; }
  const btn = document.getElementById('btn-confirm-code');
  btn.disabled = true; btn.textContent = 'Проверяем…';
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  btn.disabled = false; btn.textContent = 'Подтвердить';
  if (error) { showAuthError('auth-error-confirm', 'Код не подошёл или устарел: ' + error.message); return; }
  // Сессию подхватит onAuthStateChange, как после обычного входа
});
document.getElementById('confirm-code').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-confirm-code').click(); });

// ═══ ВХОД ЧЕРЕЗ TELEGRAM ═══
// Окно входа Telegram (oauth.telegram.org) возвращает данные, подписанные токеном бота.
// Сайт отправляет их боту на Render: он проверяет подпись, находит или создаёт аккаунт
// с этим Telegram ID в app_metadata и отдаёт одноразовый токен, по нему входим через verifyOtp.
let tgBotId = null;
// bot_id нужен окну входа сразу по клику (иначе браузер заблокирует окно), поэтому берём его
// заранее. Заодно будим сервер на Render, который засыпает без запросов.
async function prefetchTgBotId() {
  if (tgBotId) return;
  try { tgBotId = (await (await fetch(TG_LOGIN_URL)).json()).bot_id || null; } catch (e) {}
}
function tgLoginClick(errorId) {
  clearAuthError(errorId);
  if (!tgBotId) {
    showAuthError(errorId, 'Сервер входа просыпается, нажмите ещё раз через 10–20 секунд.');
    prefetchTgBotId(); return;
  }
  openTelegramAuth(tgBotId, user => finishTelegramLogin(user, errorId), errorId);
}
function inTelegramBrowser() {
  const ua = navigator.userAgent;
  // На iPhone встроенные браузеры приложений не пишут «Safari/» в userAgent, Safari, Chrome и Firefox пишут
  return !!(window.TelegramWebview || window.TelegramWebviewProxy) || /Telegram/i.test(ua)
    || (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua) && !navigator.standalone);
}
// Открыть сайт в обычном браузере телефона: на iPhone (iOS 17+) — ссылкой x-safari-https://,
// на Android — intent: без пакета, тогда откроется браузер по умолчанию.
function openInPhoneBrowser() {
  const url = location.origin + location.pathname;
  location.href = /Android/i.test(navigator.userAgent)
    ? 'intent://' + url.replace(/^https:\/\//, '') + '#Intent;scheme=https;action=android.intent.action.VIEW;end'
    : 'x-safari-' + url;
}
// То же, что Telegram.Login.auth из telegram-widget.js, но без загрузки скрипта с telegram.org:
// его режут блокировщики рекламы. Окно oauth.telegram.org присылает результат через postMessage;
// если окно закрылось без сообщения, спрашиваем результат у oauth.telegram.org сами.
const TG_OAUTH = 'https://oauth.telegram.org';
function openTelegramAuth(botId, onUser, errorId) {
  const url = `${TG_OAUTH}/auth?bot_id=${botId}&origin=${encodeURIComponent(location.origin)}`
    + `&request_access=write&lang=ru&return_to=${encodeURIComponent(location.href)}`;
  const w = 550, h = 470;
  const popup = window.open(url, 'telegram_oauth_bot' + botId,
    `width=${w},height=${h},left=${Math.max(0, (screen.width - w) / 2)},top=${Math.max(0, (screen.height - h) / 2)},status=0,location=0,menubar=0,toolbar=0`);
  if (!popup) { showAuthError(errorId, 'Браузер заблокировал окно Telegram. Разрешите всплывающие окна для сайта.'); return; }
  let done = false;
  const finish = user => {
    if (done) return;
    done = true; clearInterval(timer); window.removeEventListener('message', onMessage);
    if (user) onUser(user);
  };
  const onMessage = e => {
    if (e.origin !== TG_OAUTH || e.source !== popup) return;
    let data = {}; try { data = JSON.parse(e.data); } catch (_) {}
    if (data.event === 'auth_result') finish(data.result);
  };
  window.addEventListener('message', onMessage);
  const timer = setInterval(async () => {
    if (!popup.closed || done) return;
    clearInterval(timer);
    try {
      const r = await fetch(`${TG_OAUTH}/auth/get`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'bot_id=' + botId });
      finish((await r.json()).user || null);
    } catch (_) { finish(null); }
  }, 300);
}
async function finishTelegramLogin(user, errorId) {
  const btns = document.querySelectorAll('.auth-tg');
  btns.forEach(b => { b.disabled = true; });
  try {
    const res = await fetch(TG_LOGIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token_hash) throw new Error(data.error || 'сервер не ответил');
    const { error } = await sb.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (error) throw error;
    // Дальше сессию подхватит onAuthStateChange, как после входа по почте
  } catch (e) {
    showAuthError(errorId, 'Не удалось войти через Telegram: ' + e.message);
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}
// На телефоне (особенно во встроенном браузере Telegram) окно входа открывается не отдельно,
// а в этой же вкладке. Тогда oauth.telegram.org возвращает на сайт с #tgAuthResult=<base64 JSON>
// в адресе — забираем данные оттуда. Вызывается из init(), когда уже известно, вошёл ли пользователь.
function takeTgAuthRedirect() {
  const m = location.hash.match(/[#&]tgAuthResult=([^&]*)/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - b64.length % 4) % 4);
    // Имя может быть по-русски: atob отдаёт байты, их декодируем как UTF-8, иначе не сойдётся подпись
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    const user = JSON.parse(json);
    return user && user.id && user.hash ? user : null;
  } catch (_) { return null; }
}
document.getElementById('btn-tg-login').addEventListener('click', () => tgLoginClick('auth-error-login'));
document.getElementById('btn-tg-register').addEventListener('click', () => tgLoginClick('auth-error-register'));

// Привязка вошедшего по почте аккаунта через окно Telegram: бот проверяет подпись и выдаёт
// тот же одноразовый код, что по команде /link, сайт применяет его через link_telegram.
function tgLinkClick() {
  clearAuthError('link-error');
  if (!tgBotId) {
    showAuthError('link-error', 'Сервер Telegram просыпается, нажмите ещё раз через 10–20 секунд.');
    prefetchTgBotId(); return;
  }
  openTelegramAuth(tgBotId, linkWithTelegramUser, 'link-error');
}
async function linkWithTelegramUser(user) {
  const btn = document.getElementById('btn-link-tg');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(TG_LINK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code) throw new Error(data.error || 'сервер не ответил');
    if (await applyLinkCode(data.code)) return;
  } catch (e) {
    showAuthError('link-error', 'Не удалось привязать Telegram: ' + e.message);
  }
  if (btn) btn.disabled = false;
}

async function linkTelegram() {
  const input = document.getElementById('link-code');
  const btn   = document.getElementById('btn-link');
  const code  = input.value.trim().toUpperCase();
  clearAuthError('link-error');
  if (code.length !== 8) { showAuthError('link-error', 'Код состоит из 8 символов'); return; }
  btn.disabled = true; btn.textContent = 'Проверяем…';
  if (!await applyLinkCode(code)) { btn.disabled = false; btn.textContent = 'Привязать'; }
}

async function applyLinkCode(code) {
  const { error } = await sb.rpc('link_telegram', { p_code: code });
  if (error) {
    showAuthError('link-error', error.message);
    return false;
  }
  // Новый токен несёт app_metadata.telegram_id, по нему RLS отдаёт задачи
  const { data } = await sb.auth.refreshSession();
  currentUser = data?.user || currentUser;
  telegramId  = tgIdOf(currentUser);
  await loadProjects(); updateProjectSelect();
  await loadTasks(); renderAll();
  return true;
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  tasks = []; projects = []; updateProjectSelect(); renderAll();
});

// Enter key on login fields
document.getElementById('login-password').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('btn-login').click(); });
document.getElementById('reg-password').addEventListener('keydown',   e => { if(e.key==='Enter') document.getElementById('btn-register').click(); });

