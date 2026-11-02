// Аватар пользователя: кнопка в боковом меню (на телефоне — в шапке) и окно выбора.
// Выбор хранится в user_metadata аккаунта (avatar). Это только оформление: доступа к данным
// оно не даёт, поэтому user_metadata здесь можно (для RLS и telegramId ему по-прежнему не верим).
//   avatar = 'tg'            — фото из Telegram (tg_photo, его запоминает вход через Telegram)
//          | 'ivan:<образ>'  — готовый Иван из img/avatars/
//          | 'photo:<время>' — своё фото в хранилище Supabase: avatars/<id аккаунта>/avatar.jpg
//          | 'letter'        — первая буква имени
// Без выбора: фото из Telegram, если есть, иначе буква.

const AVATAR_IVANS = [
  ['cap', 'В кепке'], ['graduate', 'Выпускник'], ['heart', 'С сердечком'], ['robot', 'С роботом'],
  ['hoodie', 'В худи'], ['tongue', 'С языком'], ['idea', 'С идеей'], ['think', 'Задумался'],
];
const AVATAR_BUCKET = 'avatars';
const TG_PHOTO_RE = /^https:\/\/t\.me\/i\/userpic\/[\w\/.-]+$/;
// В демо-режиме аккаунта нет: выбор живёт в памяти страницы (js/demo.js включает demo)
const avatarDemo = { on: false, meta: {} };
// Аккаунт берём и из своего onAuthStateChange: первое событие сессии приходит сюда раньше,
// чем core.js успевает заполнить currentUser
let avatarSession = null;
function avUser() {
  return passwordRecovery ? null : (currentUser || avatarSession);
}

function avatarMeta() {
  return avatarDemo.on ? avatarDemo.meta : (avUser()?.user_metadata || {});
}
function avatarName() {
  const m = avatarMeta(), email = avUser()?.email || '';
  if (typeof m.full_name === 'string' && m.full_name.trim()) return m.full_name.trim().slice(0, 60);
  if (avatarDemo.on) return 'Гость';
  if (m.tg_name) return String(m.tg_name).slice(0, 60);
  // Аккаунт, созданный входом через Telegram, получает служебную почту tg<ID>@…
  if (/^tg\d+@/.test(email)) return 'Telegram';
  return email.split('@')[0] || 'Профиль';
}
function avatarSub() {
  if (avatarDemo.on) return 'Демо-режим';
  const email = avUser()?.email || '';
  if (!/^tg\d+@/.test(email)) return email;
  // Аккаунт создан входом через Telegram: настоящей почты нет, показываем ник в Telegram
  const u = String(avatarMeta().tg_username || '');
  return /^\w{4,32}$/.test(u) ? `Telegram @${u}` : 'Вход через Telegram';
}
function tgPhoto() {
  const p = avatarMeta().tg_photo;
  return typeof p === 'string' && TG_PHOTO_RE.test(p) ? p : '';
}
function photoUrl(stamp) {
  if (avatarDemo.on) return avatarDemo.photo || '';
  if (!avUser()) return '';
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${avUser().id}/avatar.jpg?v=${encodeURIComponent(stamp)}`;
}
// Что сейчас выбрано: { kind, src }
function avatarCurrent() {
  const a = String(avatarMeta().avatar || '');
  if (a.startsWith('ivan:') && AVATAR_IVANS.some(([k]) => k === a.slice(5))) return { kind: a, src: `img/avatars/${a.slice(5)}.webp` };
  if (a.startsWith('photo:') && photoUrl(a.slice(6))) return { kind: 'photo', src: photoUrl(a.slice(6)) };
  if (a === 'letter') return { kind: 'letter', src: '' };
  if (tgPhoto()) return { kind: 'tg', src: tgPhoto() };
  return { kind: 'letter', src: '' };
}
function avatarLetter() {
  const ch = [...avatarName().trim()][0] || '?';
  return escHtml(ch.toUpperCase());
}
// Круглый аватар: картинка, а если не загрузилась (фото из Telegram устарело) — буква
function avatarFace(src, cls) {
  const letter = `<span class="av-letter">${avatarLetter()}</span>`;
  return `<span class="av ${cls || ''}">${letter}${src ? `<img src="${escHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
}
function hideBrokenAvatars(root) {
  root.querySelectorAll('.av img').forEach(img => {
    img.addEventListener('error', () => img.remove(), { once: true });
  });
}

function renderAvatar() {
  const btn = document.getElementById('btn-avatar');
  if (!btn) return;
  const show = avatarDemo.on || !!avUser();
  btn.hidden = !show;
  if (!show) { closeAvatarMenu(false); return; }
  btn.innerHTML = avatarFace(avatarCurrent().src, 'av-btn') +
    `<span class="av-who"><span class="av-name">${escHtml(avatarName())}</span><span class="av-sub">${escHtml(avatarSub())}</span></span>`;
  btn.setAttribute('aria-label', `Аватар: ${avatarName()}. Сменить`);
  hideBrokenAvatars(btn);
  if (typeof checkAdmin === 'function') checkAdmin();
  if (avatarMenu.box) paintAvatarMenu();
}

// Запись выбора. В демо подменяется (js/demo.js)
async function saveAvatarMeta(patch) {
  if (avatarDemo.on) { Object.assign(avatarDemo.meta, patch); return null; }
  // currentUser обновит onAuthStateChange (USER_UPDATED) в core.js ещё до ответа updateUser
  const { error } = await sb.auth.updateUser({ data: patch });
  return error;
}

// Вход или привязка через Telegram: запоминаем имя и фото оттуда (если фото не скрыто настройками Telegram)
function rememberTgProfile(user) {
  if (!user) return;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim().slice(0, 60);
  const photo = TG_PHOTO_RE.test(user.photo_url || '') ? user.photo_url : null;
  const username = /^\w{4,32}$/.test(user.username || '') ? user.username : null;
  const m = avUser()?.user_metadata || {};
  if ((m.tg_name || '') === name && (m.tg_photo || null) === photo && (m.tg_username || null) === username) return;
  setTimeout(async () => {
    await saveAvatarMeta({ tg_name: name || null, tg_photo: photo, tg_username: username });
    renderAvatar();
  }, 0);
}

// Своё фото: обрезаем по центру в квадрат 256×256 и сохраняем в JPEG — так файл весит 20–40 КБ
function readDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('не удалось прочитать файл'));
    fr.readAsDataURL(blob);
  });
}
// Картинку открываем через data: — blob: адреса запрещает Content-Security-Policy
async function squareJpeg(file) {
  const src = await readDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight), size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size); // прозрачный PNG — на белом
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      c.toBlob(b => b ? resolve(b) : reject(new Error('не удалось обработать фото')), 'image/jpeg', 0.88);
    };
    img.onerror = () => reject(new Error('этот формат не открывается, выберите JPG или PNG'));
    img.src = src;
  });
}
// Загрузка в хранилище. В демо подменяется: фото остаётся только на странице
async function uploadAvatarBlob(blob) {
  if (avatarDemo.on) {
    avatarDemo.photo = await readDataUrl(blob);
    return null;
  }
  const { error } = await sb.storage.from(AVATAR_BUCKET)
    .upload(`${avUser().id}/avatar.jpg`, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  return error;
}
async function removeAvatarPhoto() {
  if (avatarDemo.on) { avatarDemo.photo = ''; return; }
  try { await sb.storage.from(AVATAR_BUCKET).remove([`${avUser().id}/avatar.jpg`]); } catch (_) {}
}

// ═══ Окно выбора ═══
const avatarMenu = { box: null, back: null, busy: false, msg: '', editing: false };
function closeAvatarMenu(returnFocus) {
  if (!avatarMenu.box) return;
  avatarMenu.box.remove();
  if (avatarMenu.back) avatarMenu.back.remove();
  avatarMenu.box = avatarMenu.back = null;
  avatarMenu.msg = ''; avatarMenu.editing = false;
  const btn = document.getElementById('btn-avatar');
  btn.setAttribute('aria-expanded', 'false');
  if (returnFocus) btn.focus();
}
// Часовой пояс: «Екатеринбург · МСК+2». Определяется сам (syncTimezone в data.js), поменять руками нельзя
const CLOCK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
function avatarTzHTML() {
  const tz = avatarDemo.on ? deviceTz() : (userTz || deviceTz());
  if (!tz) return '';
  const diff = mskDiff(tz);
  return `<div class="av-tz"><span class="backup-ico">${CLOCK_ICON}</span><span class="opt-text">${escHtml(tzCity(tz))}${diff ? ` · ${escHtml(diff)}` : ''}` +
    `<small>Часовой пояс определён по устройству. По нему приходят напоминания и утренняя сводка</small></span></div>`;
}
// Утренняя сводка от бота: выключатель и время (шаг 30 минут, с 5:00 до 12:00), сохраняется сразу
const SUN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v2M5.6 5.6l1.4 1.4M3 13h2M19 13h2M17 7l1.4-1.4M7 17a5 5 0 0 1 10 0"/><path d="M3 21h18"/></svg>';
const STEP_ICON = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const MORNING_MIN = 5 * 60, MORNING_MAX = 12 * 60;
const morningDemo = { on: true, time: MORNING_DEFAULT };
let morningSaveTimer = null;
function morningState() { return avatarDemo.on ? morningDemo : { on: morningOn, time: morningTime }; }
function morningMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function avatarMorningHTML() {
  const st = morningState();
  if (st.on === null || (!avatarDemo.on && !telegramId)) return '';
  const m = morningMin(st.time);
  const time = st.on ? `<div class="av-morning-time"><span>Приходит в</span>
      <button type="button" class="av-step" data-morning-step="-30" aria-label="На 30 минут раньше" ${m <= MORNING_MIN ? 'disabled' : ''}>${STEP_ICON('M15 6l-6 6 6 6')}</button>
      <span class="av-morning-val" aria-live="polite">${escHtml(st.time)}</span>
      <button type="button" class="av-step" data-morning-step="30" aria-label="На 30 минут позже" ${m >= MORNING_MAX ? 'disabled' : ''}>${STEP_ICON('M9 6l6 6-6 6')}</button></div>` : '';
  return `<button type="button" class="ui-opt backup-opt av-morning" data-morning-toggle role="switch" aria-checked="${!!st.on}">
      <span class="backup-ico">${SUN_ICON}</span><span class="opt-text">Утренняя сводка в Telegram<small>Задачи на день, просроченные и серия дней</small></span>
      <span class="av-switch" aria-hidden="true"></span></button>${time}`;
}
function changeMorning(on, time) {
  const st = morningState();
  if (avatarDemo.on) { morningDemo.on = on; morningDemo.time = time; paintAvatarMenu(); return; }
  const prev = { on: st.on, time: st.time };
  morningOn = on; morningTime = time; avatarMenu.msg = '';
  paintAvatarMenu();
  // Стрелку времени жмут несколько раз подряд — сохраняем, когда перестали
  clearTimeout(morningSaveTimer);
  morningSaveTimer = setTimeout(async () => {
    const err = await saveMorning(morningOn, morningTime);
    if (!err) return;
    morningOn = prev.on; morningTime = prev.time;
    avatarMenu.msg = 'Настройка сводки не сохранилась: ' + err.message;
    if (avatarMenu.box) paintAvatarMenu();
  }, 600);
}
function paintAvatarMenu() {
  const box = avatarMenu.box, cur = avatarCurrent();
  const hasPhoto = String(avatarMeta().avatar || '').startsWith('photo:');
  const opt = (kind, src, label) =>
    `<button type="button" class="av-opt" data-av="${escHtml(kind)}" aria-pressed="${cur.kind === kind}" aria-label="${escHtml(label)}" title="${escHtml(label)}">` +
    avatarFace(src, 'av-pick') + `<span class="av-tick">${ICON.check}</span></button>`;
  const opts = [];
  if (tgPhoto()) opts.push(opt('tg', tgPhoto(), 'Фото из Telegram'));
  if (hasPhoto) opts.push(opt('photo', photoUrl(String(avatarMeta().avatar).slice(6)), 'Своё фото'));
  opts.push(opt('letter', '', 'Буква имени'));
  AVATAR_IVANS.forEach(([k, label]) => opts.push(opt('ivan:' + k, `img/avatars/${k}.webp`, 'Иван: ' + label.toLowerCase())));
  box.innerHTML = `<div class="ui-pop-title">Аватар</div>
    <div class="av-head">${avatarFace(cur.src, 'av-big')}<div class="av-who">${avatarMenu.editing
      ? `<textarea class="one-line av-name-input" rows="1" wrap="off" maxlength="60" aria-label="Имя и фамилия" placeholder="Имя и фамилия">${escHtml(avatarName())}</textarea>
         <span class="av-name-btns"><button type="button" class="av-name-save" data-name-save>Сохранить</button><button type="button" class="av-name-cancel" data-name-cancel>Отмена</button></span>`
      : `<span class="av-name-row"><span class="av-name">${escHtml(avatarName())}</span><button type="button" class="av-name-edit" data-name-edit aria-label="Изменить имя и фамилию" title="Изменить имя">${ICON.note}</button></span>`}
      <span class="av-sub">${escHtml(avatarSub())}</span></div></div>
    ${avatarTzHTML()}
    ${avatarMorningHTML()}
    ${typeof adminMenuHTML === 'function' ? adminMenuHTML() : ''}
    <div class="av-grid" role="group" aria-label="Выберите аватар">${opts.join('')}</div>
    <button type="button" class="ui-opt backup-opt av-upload" data-av-upload ${avatarMenu.busy ? 'disabled' : ''}>
      <span class="backup-ico">${ICON.up}</span><span class="opt-text">${avatarMenu.busy ? 'Загружаем…' : 'Загрузить своё фото'}<small>JPG или PNG, обрежем в квадрат</small></span></button>
    ${avatarDemo.on ? '' : `<button type="button" class="ui-opt backup-opt av-logout" data-av-logout><span class="backup-ico">${ICON.exit}</span><span class="opt-text">Выйти</span></button>`}
    ${avatarMenu.msg ? `<p class="av-msg" role="alert">${escHtml(avatarMenu.msg)}</p>` : ''}`;
  hideBrokenAvatars(box);
  const input = box.querySelector('.av-name-input');
  if (input) {
    singleLine(input, saveAvatarName);
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); avatarMenu.editing = false; paintAvatarMenu(); box.querySelector('[data-name-edit]')?.focus(); }
    });
  }
}
// Имя и фамилия: хранится в user_metadata.full_name; пустое — снова имя из Telegram или начало почты
async function saveAvatarName() {
  const input = avatarMenu.box?.querySelector('.av-name-input');
  if (!input || avatarMenu.busy) return;
  const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 60);
  avatarMenu.busy = true; avatarMenu.msg = '';
  const err = await saveAvatarMeta({ full_name: name || null });
  avatarMenu.busy = false;
  if (err) { avatarMenu.msg = 'Имя не сохранилось: ' + err.message; paintAvatarMenu(); return; }
  avatarMenu.editing = false;
  renderAvatar();
  avatarMenu.box?.querySelector('[data-name-edit]')?.focus();
}
function openAvatarMenu() {
  const btn = document.getElementById('btn-avatar');
  const sheet = isSheet();
  if (sheet) {
    avatarMenu.back = document.createElement('div');
    avatarMenu.back.className = 'ui-backdrop';
    avatarMenu.back.addEventListener('click', () => closeAvatarMenu(true));
    document.body.appendChild(avatarMenu.back);
  }
  const box = document.createElement('div');
  box.className = 'ui-pop avatar-menu' + (sheet ? ' sheet' : '');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Аватар');
  box.addEventListener('click', onAvatarMenuClick);
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeAvatarMenu(true); } });
  avatarMenu.box = box;
  paintAvatarMenu();
  document.body.appendChild(box);
  btn.setAttribute('aria-expanded', 'true');
  if (!sheet) {
    // Внизу бокового меню — окно над кнопкой, в шапке — под ней
    const r = btn.getBoundingClientRect(), w = 320;
    box.style.width = w + 'px';
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    if (r.top > innerHeight / 2) box.style.bottom = (innerHeight - r.top + 8) + 'px';
    else box.style.top = (r.bottom + 8) + 'px';
  }
  (box.querySelector('.av-opt[aria-pressed="true"]') || box.querySelector('.av-opt')).focus();
}
async function onAvatarMenuClick(e) {
  if (avatarMenu.busy) return;
  if (e.target.closest('[data-morning-toggle]')) {
    const st = morningState();
    changeMorning(!st.on, st.time);
    avatarMenu.box?.querySelector('[data-morning-toggle]')?.focus();
    return;
  }
  const step = e.target.closest('[data-morning-step]');
  if (step) {
    const st = morningState();
    const m = Math.min(MORNING_MAX, Math.max(MORNING_MIN, morningMin(st.time) + Number(step.dataset.morningStep)));
    changeMorning(st.on, String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
    const again = avatarMenu.box?.querySelector(`[data-morning-step="${step.dataset.morningStep}"]`);
    (again && !again.disabled ? again : avatarMenu.box?.querySelector('[data-morning-toggle]'))?.focus();
    return;
  }
  if (e.target.closest('[data-admin-stats]')) { openAdminStats(); return; }
  if (e.target.closest('[data-av-logout]')) { closeAvatarMenu(false); document.getElementById('btn-logout').click(); return; }
  if (e.target.closest('[data-name-edit]')) {
    avatarMenu.editing = true; avatarMenu.msg = ''; paintAvatarMenu();
    const input = avatarMenu.box.querySelector('.av-name-input');
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    return;
  }
  if (e.target.closest('[data-name-save]')) { saveAvatarName(); return; }
  if (e.target.closest('[data-name-cancel]')) { avatarMenu.editing = false; paintAvatarMenu(); avatarMenu.box.querySelector('[data-name-edit]')?.focus(); return; }
  if (e.target.closest('[data-av-upload]')) { document.getElementById('avatar-file').click(); return; }
  const b = e.target.closest('[data-av]');
  if (!b) return;
  const kind = b.dataset.av;
  const meta = avatarMeta();
  const prev = String(meta.avatar || '');
  const next = kind === 'photo' ? prev : kind;
  if (next === prev && prev) return;
  avatarMenu.busy = true; avatarMenu.msg = '';
  const err = await saveAvatarMeta({ avatar: next });
  avatarMenu.busy = false;
  if (err) { avatarMenu.msg = 'Не сохранилось: ' + err.message; paintAvatarMenu(); return; }
  // Своё фото заменили на другое — удаляем файл из хранилища, чтобы оно там не лежало
  if (prev.startsWith('photo:') && !next.startsWith('photo:')) removeAvatarPhoto();
  renderAvatar();
  avatarMenu.box?.querySelector(`.av-opt[data-av="${CSS.escape(kind)}"]`)?.focus();
}
async function uploadAvatarFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { avatarMenu.msg = 'Это не картинка. Выберите фото JPG или PNG.'; renderAvatar(); return; }
  if (file.size > 15 * 1024 * 1024) { avatarMenu.msg = 'Фото больше 15 МБ, выберите поменьше.'; renderAvatar(); return; }
  avatarMenu.busy = true; avatarMenu.msg = ''; renderAvatar();
  try {
    const blob = await squareJpeg(file);
    const upErr = await uploadAvatarBlob(blob);
    if (upErr) throw new Error(/bucket|not found/i.test(upErr.message) ? 'хранилище фото ещё не настроено' : upErr.message);
    const err = await saveAvatarMeta({ avatar: 'photo:' + Date.now() });
    if (err) throw err;
  } catch (e) {
    avatarMenu.msg = 'Не удалось загрузить фото: ' + e.message;
  }
  avatarMenu.busy = false;
  renderAvatar();
}

document.getElementById('btn-avatar').addEventListener('click', () => {
  if (avatarMenu.box) closeAvatarMenu(false); else openAvatarMenu();
});
document.addEventListener('mousedown', e => {
  if (avatarMenu.box && !avatarMenu.box.contains(e.target) && !e.target.closest('#btn-avatar')) closeAvatarMenu(false);
});
document.getElementById('avatar-file').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  uploadAvatarFile(file);
});
// Вход, выход и обновление аккаунта (в том числе после смены аватара на другом устройстве)
sb.auth.onAuthStateChange((event, session) => {
  avatarSession = session?.user || null;
  setTimeout(renderAvatar, 0);
});
