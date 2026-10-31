// Знакомство: заставка с Иваном при первом открытии вкладки и окно «Спасибо за регистрацию»

const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ═══ ЗАСТАВКА ═══
// Один раз за сессию вкладки, ~1.4 с. Не перехватывает клики (pointer-events:none),
// поэтому вход не задерживает: форму можно заполнять сразу. При reduced-motion не показываем.
(function showSplash() {
  if (reducedMotion) return;
  let seen = true;
  try { seen = !!sessionStorage.getItem('spm2_splash'); sessionStorage.setItem('spm2_splash', '1'); } catch (_) {}
  if (seen) return;
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('aria-hidden', 'true');
  // Готовые позы маскота, сменяют друг друга: идея → класс → кубок
  el.innerHTML = `<div class="splash-stage">
      <img class="splash-ivan p1" src="img/ivan/idea.webp" alt="" width="120" height="166">
      <img class="splash-ivan p2" src="img/ivan/thumb.webp" alt="" width="120" height="166">
      <img class="splash-ivan p3" src="img/ivan/trophy.webp" alt="" width="120" height="166">
      <span class="splash-shadow"></span>
    </div>
    <div class="splash-name">Синергия<span>PM</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
})();

// ═══ ОКНО ПОСЛЕ РЕГИСТРАЦИИ ═══
// Показываем новому аккаунту один раз: после кода из письма (флаг spm2_just_registered
// ставит auth.js) или при первом входе через Telegram (аккаунт создан только что).
const WELCOME_KEY = 'spm2_welcome_shown';
function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (_) {} }

function isNewAccount(user) {
  const age = Date.now() - new Date(user.created_at || 0).getTime();
  // По ссылке из письма могут вернуться не сразу, поэтому с флагом ждём дольше
  return age < (lsGet('spm2_just_registered') ? 7 * 864e5 : 15 * 6e4);
}

function showWelcome(user) {
  if (document.querySelector('.welcome-backdrop')) return;
  const linked = !!tgIdOf(user);
  const back = document.createElement('div');
  back.className = 'welcome-backdrop';
  back.innerHTML = `<div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-text">
      <img class="welcome-ivan" src="img/ivan/heart.webp" alt="" width="96" height="132">
      <h2 class="welcome-title" id="welcome-title">Спасибо за регистрацию!</h2>
      <p class="welcome-text" id="welcome-text">Это планер задач, который можно вести через Telegram и&nbsp;через сайт: задачи из бота сразу появляются здесь, а&nbsp;бот напоминает о&nbsp;них вовремя.</p>
      ${linked
        ? `<p class="welcome-note">Telegram уже привязан — просто напишите боту задачу, например «Позвонить маме завтра в 18:00».</p>`
        : `<ol class="welcome-steps">
            <li><span>1</span>На главной нажмите «Привязать через Telegram» и подтвердите вход в окне Telegram.</li>
            <li><span>2</span>Или отправьте боту команду /link и введите код из 8 символов на сайте.</li>
            <li><span>3</span>Пишите задачи боту — они появятся в списке, календаре и проектах.</li>
          </ol>`}
      <button type="button" class="auth-btn welcome-ok">Понятно</button>
    </div>`;
  const prevFocus = document.activeElement;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  const onKey = e => {
    if (e.key === 'Escape') close();
    // Фокус не уходит из окна: в нём одна кнопка
    if (e.key === 'Tab') { e.preventDefault(); back.querySelector('.welcome-ok').focus(); }
  };
  back.querySelector('.welcome-ok').addEventListener('click', close);
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  back.querySelector('.welcome-ok').focus();
  lsSet(WELCOME_KEY, user.id);
  lsDel('spm2_just_registered');
}

function maybeWelcome(user) {
  if (!user || lsGet(WELCOME_KEY) === user.id) return;
  if (!isNewAccount(user)) { lsDel('spm2_just_registered'); return; }
  // Ждём, пока закроется экран входа и пройдёт заставка
  setTimeout(() => {
    if (document.body.classList.contains('auth-locked')) return; // ещё задаётся пароль — покажем при следующем событии
    showWelcome(user);
  }, 1600);
}

// Видимый пароль не оставляем после входа: при выходе формы снова прячут его
function resetPasswordEyes() {
  // Повторный клик по «глазу» возвращает type="password" и подпись кнопки
  document.querySelectorAll('.auth-eye[aria-pressed="true"]').forEach(btn => { btn.click(); btn.blur(); });
}

// Регистрация через Telegram: галочки согласий отмечены на сайте, а аккаунт создал сервер бота.
// Записываем отметку о согласиях в user_metadata новому аккаунту (по почте её пишет сам signUp).
function savePendingConsent(user) {
  const raw = lsGet('spm2_consent_pending');
  if (!raw) return;
  lsDel('spm2_consent_pending');
  if (user.user_metadata?.consent) return;
  let consent = null;
  try { consent = JSON.parse(raw); } catch (_) { return; }
  // Отметка устарела (вход отменили и вернулись позже) — не приписываем её чужому аккаунту
  if (!consent?.at || Date.now() - new Date(consent.at).getTime() > 36e5) return;
  // Вызов Supabase изнутри onAuthStateChange может зависнуть — выносим из обработчика
  setTimeout(() => { sb.auth.updateUser({ data: { consent } }).catch(() => {}); }, 0);
}

// Галочки согласий снова пустые, когда экран входа откроется после выхода
function resetConsentChecks() {
  ['reg-terms', 'reg-consent', 'reg-transfer'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = false; });
}

if (!new URLSearchParams(location.search).has('demo')) {
  sb.auth.onAuthStateChange((event, session) => {
    if (!session?.user) return;
    resetPasswordEyes();
    resetConsentChecks();
    savePendingConsent(session.user);
    maybeWelcome(session.user);
  });
}
