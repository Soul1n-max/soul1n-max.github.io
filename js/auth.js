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
  const pass2 = document.getElementById('reg-password2').value;
  clearAuthError('auth-error-register');
  if (!email || !pass) { showAuthError('auth-error-register','Заполните email и пароль'); return; }
  if (pass.length < 8) { showAuthError('auth-error-register','Пароль минимум 8 символов'); return; }
  if (pass !== pass2) {
    showAuthError('auth-error-register','Пароли не совпадают — введите один и тот же пароль дважды');
    document.getElementById('reg-password2').focus();
    return;
  }
  if (!consentsGiven()) return;
  const btn = document.getElementById('btn-register');
  btn.disabled = true; btn.textContent = 'Создание…';
  // Ссылка из письма ведёт обратно на этот сайт, а не на адрес по умолчанию
  const { error } = await sb.auth.signUp({ email, password: pass,
    options: { emailRedirectTo: location.origin + location.pathname, data: { consent: consentRecord() } } });
  btn.disabled = false; btn.textContent = 'Создать аккаунт';
  if (error) { showAuthError('auth-error-register', error.message); return; }
  // Окно «Спасибо за регистрацию» покажет js/onboarding.js после подтверждения кода
  try { localStorage.setItem('spm2_just_registered', '1'); } catch (_) {}
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

// ═══ СОГЛАСИЯ ПРИ РЕГИСТРАЦИИ ═══
// Три отдельные галочки: соглашение с подтверждением возраста (#reg-terms), согласие на обработку ПДн
// (#reg-consent) и согласие на трансграничную передачу (#reg-transfer). Без всех трёх регистрация не начинается.
// Номера редакций документов: меняете terms / privacy / consent / transfer.html — увеличьте и здесь.
const CONSENT_VERSION = { terms: 1, privacy: 1, consent: 1, transfer: 1, age14: true };
const CONSENT_CHECKS = [
  { id: 'reg-terms',    what: 'примите пользовательское соглашение и подтвердите возраст' },
  { id: 'reg-consent',  what: 'дайте согласие на обработку персональных данных' },
  { id: 'reg-transfer', what: 'дайте согласие на трансграничную передачу персональных данных' },
];
function consentsGiven() {
  const missing = CONSENT_CHECKS.filter(c => {
    const box = document.getElementById(c.id);
    if (box.checked) box.removeAttribute('aria-invalid'); else box.setAttribute('aria-invalid', 'true');
    return !box.checked;
  });
  if (!missing.length) return true;
  showAuthError('auth-error-register', missing.length === 1
    ? 'Чтобы зарегистрироваться, ' + missing[0].what + '.'
    : `Чтобы зарегистрироваться, отметьте ${missing.length === CONSENT_CHECKS.length ? 'все три галочки' : 'обе пустые галочки'}: они подсвечены красным.`);
  document.getElementById(missing[0].id).focus();
  return false;
}
// Когда и на какие редакции дано согласие: сохраняется в user_metadata аккаунта как подтверждение.
// Для доступа к данным это поле не используется (ему не доверяем, см. tgIdOf).
function consentRecord() {
  return { ...CONSENT_VERSION, at: new Date().toISOString() };
}
CONSENT_CHECKS.forEach(c => document.getElementById(c.id).addEventListener('change', e => {
  e.target.removeAttribute('aria-invalid');
  if (CONSENT_CHECKS.every(x => document.getElementById(x.id).checked)) clearAuthError('auth-error-register');
}));

// ═══ ВОССТАНОВЛЕНИЕ ПАРОЛЯ ═══
// Supabase шлёт письмо со ссылкой (и кодом, если он есть в шаблоне «Reset Password»).
// Ссылка возвращает на сайт уже со входом — остаётся задать пароль. Код вводится здесь же:
// verifyOtp с type 'recovery' даёт тот же вход. Пока флаг passwordRecovery стоит,
// onAuthStateChange не открывает планнер; его откроет USER_UPDATED после смены пароля.
let resetEmail = null;
function showResetForm(email) {
  resetEmail = email;
  clearAuthError('auth-error-reset');
  document.getElementById('reset-code-field').style.display = email ? '' : 'none';
  const sub = document.getElementById('reset-sub');
  if (email) {
    sub.textContent = 'Мы отправили письмо на ';
    sub.appendChild(document.createElement('b')).textContent = email;
    sub.append('. Введите код из письма или нажмите ссылку в нём.');
  } else {
    sub.textContent = 'Придумайте новый пароль для входа.';
  }
  switchAuthForm('reset');
  document.getElementById(email ? 'reset-code' : 'reset-password').focus();
}

document.getElementById('btn-forgot').addEventListener('click', () => {
  clearAuthError('auth-error-login'); clearAuthError('auth-error-forgot');
  document.getElementById('forgot-email').value = document.getElementById('login-email').value.trim();
  switchAuthForm('forgot');
  document.getElementById('forgot-email').focus();
});
document.getElementById('btn-forgot-back').addEventListener('click', () => switchAuthForm('login'));

document.getElementById('btn-forgot-send').addEventListener('click', async () => {
  const email = document.getElementById('forgot-email').value.trim();
  clearAuthError('auth-error-forgot');
  if (!/^\S+@\S+\.\S+$/.test(email)) { showAuthError('auth-error-forgot', 'Введите почту'); return; }
  const btn = document.getElementById('btn-forgot-send');
  btn.disabled = true; btn.textContent = 'Отправляем…';
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  btn.disabled = false; btn.textContent = 'Отправить письмо';
  if (error) {
    showAuthError('auth-error-forgot', error.status === 429
      ? 'Письмо уже отправлено, следующее можно запросить чуть позже.' : error.message);
    return;
  }
  document.getElementById('login-email').value = email;
  showResetForm(email);
});
document.getElementById('forgot-email').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-forgot-send').click(); });

document.getElementById('btn-reset-save').addEventListener('click', async () => {
  const pass = document.getElementById('reset-password').value;
  clearAuthError('auth-error-reset');
  const btn = document.getElementById('btn-reset-save');
  const { data: { session } } = await sb.auth.getSession();
  let token = '';
  if (!session) {
    token = document.getElementById('reset-code').value.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(token)) { showAuthError('auth-error-reset', 'Введите цифры из письма'); return; }
  }
  if (pass.length < 8) { showAuthError('auth-error-reset', 'Пароль минимум 8 символов'); return; }
  btn.disabled = true; btn.textContent = 'Сохраняем…';
  if (!session) {
    passwordRecovery = true;
    const { error } = await sb.auth.verifyOtp({ email: resetEmail, token, type: 'recovery' });
    if (error) {
      passwordRecovery = false;
      btn.disabled = false; btn.textContent = 'Сохранить пароль';
      showAuthError('auth-error-reset', 'Код не подошёл или устарел: ' + error.message);
      return;
    }
    // Код принят, вход уже есть — поле кода больше не нужно, даже если пароль не подойдёт
    document.getElementById('reset-code-field').style.display = 'none';
  }
  passwordRecovery = false;
  const { error } = await sb.auth.updateUser({ password: pass });
  btn.disabled = false; btn.textContent = 'Сохранить пароль';
  if (error) {
    passwordRecovery = true;
    showAuthError('auth-error-reset', error.code === 'same_password'
      ? 'Новый пароль совпадает со старым — придумайте другой.' : error.message);
  }
  // При успехе USER_UPDATED в onAuthStateChange откроет планнер
});
document.getElementById('reset-password').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-reset-save').click(); });
document.getElementById('reset-code').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('reset-password').focus(); });

document.getElementById('btn-reset-back').addEventListener('click', async () => {
  // После ссылки или кода вход уже есть — выходим, чтобы планнер не открылся без нового пароля
  const recovering = passwordRecovery;
  passwordRecovery = false;
  if (recovering) await sb.auth.signOut({ scope: 'local' });
  switchAuthForm('login');
});

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
document.getElementById('btn-tg-register').addEventListener('click', () => {
  if (!consentsGiven()) return;
  // Аккаунт через Telegram создаёт сервер бота, поэтому отметку о согласиях запишет js/onboarding.js после входа
  try { localStorage.setItem('spm2_consent_pending', JSON.stringify(consentRecord())); } catch (_) {}
  tgLoginClick('auth-error-register');
});

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

// Выходим только в этом браузере. Без scope: 'local' Supabase завершает вход на всех
// устройствах сразу (scope 'global'), и остальные браузеры через час выкидывало на экран входа.
document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut({ scope: 'local' });
  tasks = []; projects = []; updateProjectSelect(); renderAll();
});

// Enter key on login fields
document.getElementById('login-password').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('btn-login').click(); });
document.getElementById('reg-password').addEventListener('keydown',   e => { if(e.key==='Enter') document.getElementById('reg-password2').focus(); });
document.getElementById('reg-password2').addEventListener('keydown',  e => { if(e.key==='Enter') document.getElementById('btn-register').click(); });

// ═══ ПОКАЗАТЬ / СКРЫТЬ ПАРОЛЬ ═══
// Кнопка-«глаз» у каждого поля пароля: вход, регистрация (оба поля), новый пароль.
const EYE_OPEN  = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_SHUT  = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
document.querySelectorAll('#auth-overlay input[type="password"]').forEach(input => {
  const wrap = document.createElement('div');
  wrap.className = 'auth-pass';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'auth-eye';
  btn.setAttribute('aria-controls', input.id);
  const paint = shown => {
    btn.innerHTML = shown ? EYE_SHUT : EYE_OPEN;
    btn.setAttribute('aria-pressed', String(shown));
    btn.setAttribute('aria-label', shown ? 'Скрыть пароль' : 'Показать пароль');
  };
  paint(false);
  btn.addEventListener('click', () => {
    const shown = input.type === 'password';
    input.type = shown ? 'text' : 'password';
    paint(shown);
    input.focus();
  });
  wrap.appendChild(btn);
});

