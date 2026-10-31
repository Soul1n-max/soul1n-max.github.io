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
    if (document.querySelector('.consent-gate')) return;         // сначала согласия, окно покажет acceptGate
    showWelcome(user);
  }, 1600);
}

// ═══ СОГЛАСИЯ ПОСЛЕ ВХОДА ═══
// Аккаунт без отметки о согласиях на текущие редакции (CONSENT_VERSION в auth.js) — создан входом через
// Telegram с формы входа, где галочек нет, или зарегистрирован до появления документов. Пока галочки
// не отмечены, планер закрыт окном; выйти можно. Отметка — только подтверждение для документов,
// доступ к данным по-прежнему решает RLS по app_metadata.
function consentCurrent(c) {
  return !!c && Object.keys(CONSENT_VERSION).every(k =>
    typeof CONSENT_VERSION[k] === 'number' ? c[k] >= CONSENT_VERSION[k] : c[k] === CONSENT_VERSION[k]);
}

function showConsentGate(user) {
  if (document.querySelector('.consent-gate')) return;
  const back = document.createElement('div');
  back.className = 'welcome-backdrop consent-gate';
  // Тексты галочек — те же, что в форме регистрации
  const checks = CONSENT_CHECKS.map(c => {
    const label = document.getElementById(c.id).closest('label').querySelector('span').innerHTML;
    return `<label class="auth-check"><input type="checkbox" data-gate="${c.id}"><span>${label}</span></label>`;
  }).join('');
  back.innerHTML = `<div class="welcome" role="dialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-text">
      <img class="welcome-ivan" src="img/ivan/think.webp" alt="" width="96" height="132">
      <h2 class="welcome-title" id="gate-title">Остался один шаг</h2>
      <p class="welcome-text" id="gate-text">Чтобы пользоваться планером, примите документы. Без этого мы не можем хранить ваши задачи.</p>
      <div class="auth-error" id="gate-error" role="alert"></div>
      <fieldset class="auth-consents gate-checks"><legend class="sr-only">Согласия</legend>${checks}</fieldset>
      <button type="button" class="auth-btn" data-gate-ok>Принять и продолжить</button>
      <button type="button" class="gate-logout" data-gate-out>Не принимаю, выйти</button>
    </div>`;
  const boxes = [...back.querySelectorAll('[data-gate]')];
  boxes.forEach(b => b.addEventListener('change', () => {
    b.removeAttribute('aria-invalid');
    if (boxes.every(x => x.checked)) clearAuthError('gate-error');
  }));
  back.querySelector('[data-gate-ok]').addEventListener('click', async e => {
    const missing = boxes.filter(b => !b.checked);
    boxes.forEach(b => { if (b.checked) b.removeAttribute('aria-invalid'); else b.setAttribute('aria-invalid', 'true'); });
    if (missing.length) {
      showAuthError('gate-error', missing.length === 1
        ? 'Чтобы продолжить, ' + CONSENT_CHECKS.find(c => c.id === missing[0].dataset.gate).what + '.'
        : 'Чтобы продолжить, отметьте все галочки: пустые подсвечены красным.');
      missing[0].focus();
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Сохраняем…';
    const { error } = await sb.auth.updateUser({ data: { consent: consentRecord() } });
    if (error) {
      btn.disabled = false; btn.textContent = 'Принять и продолжить';
      showAuthError('gate-error', 'Не удалось сохранить: ' + error.message);
      return;
    }
    back.remove();
    document.removeEventListener('keydown', onKey);
    maybeWelcome(user);
  });
  back.querySelector('[data-gate-out]').addEventListener('click', () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    document.getElementById('btn-logout').click();
  });
  // Окно не закрывается по Esc и клику мимо; Tab ходит только по его элементам
  const onKey = e => {
    if (!back.isConnected) { document.removeEventListener('keydown', onKey); return; } // окно убрали при выходе
    if (e.key !== 'Tab') return;
    const f = [...back.querySelectorAll('input, a, button')];
    const i = f.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
    e.preventDefault(); f[next].focus();
  };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  boxes[0].focus();
}

// Видимый пароль не оставляем после входа: при выходе формы снова прячут его
function resetPasswordEyes() {
  // Повторный клик по «глазу» возвращает type="password" и подпись кнопки
  document.querySelectorAll('.auth-eye[aria-pressed="true"]').forEach(btn => { btn.click(); btn.blur(); });
}

// Регистрация через Telegram: галочки согласий отмечены на сайте, а аккаунт создал сервер бота.
// Записываем отметку о согласиях в user_metadata новому аккаунту (по почте её пишет сам signUp).
// Возвращает true, если отметка записывается сейчас — тогда окно согласий не нужно.
function savePendingConsent(user) {
  const raw = lsGet('spm2_consent_pending');
  if (!raw) return false;
  lsDel('spm2_consent_pending');
  if (consentCurrent(user.user_metadata?.consent)) return false;
  let consent = null;
  try { consent = JSON.parse(raw); } catch (_) { return false; }
  // Отметка устарела (вход отменили и вернулись позже) — не приписываем её чужому аккаунту
  if (!consent?.at || Date.now() - new Date(consent.at).getTime() > 36e5) return false;
  // Вызов Supabase изнутри onAuthStateChange может зависнуть — выносим из обработчика
  setTimeout(() => { sb.auth.updateUser({ data: { consent } }).catch(() => {}); }, 0);
  return true;
}

// Галочки согласий снова пустые, когда экран входа откроется после выхода
function resetConsentChecks() {
  ['reg-terms', 'reg-consent', 'reg-transfer'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = false; });
}

if (!new URLSearchParams(location.search).has('demo')) {
  sb.auth.onAuthStateChange((event, session) => {
    // Вышли (в том числе на другой вкладке) — окно согласий не должно остаться поверх экрана входа
    if (!session?.user) { document.querySelector('.consent-gate')?.remove(); return; }
    resetPasswordEyes();
    resetConsentChecks();
    const saving = savePendingConsent(session.user);
    // Пока задаётся новый пароль, планер закрыт экраном сброса — окно согласий покажем после
    if (!saving && !passwordRecovery && !consentCurrent(session.user.user_metadata?.consent)) {
      setTimeout(() => showConsentGate(session.user), 0);
      return;
    }
    maybeWelcome(session.user);
  });
}
