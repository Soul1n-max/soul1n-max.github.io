// Статистика для админа: пункт «Статистика» в окне аватара и окно с вкладками «Статистика» и «Пользователи».
// Кто админ, решает база (supabase/13_admin_stats.sql): is_admin() — показать пункт,
// admin_stats() — числа, admin_users() (14_admin_users.sql) — список людей; чужому аккаунту обе отвечают ошибкой.
// Содержимое задач сюда не приходит: у пользователя видно только число его задач.

const admin = { uid: null, is: false, box: null, back: null, tab: 'stats', users: null, q: '', sort: 'new' };
const CHART_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';

// Вызывает renderAvatar(): при смене аккаунта один раз спрашиваем базу
function checkAdmin() {
  // В демо пункт виден только по адресу ?demo&admin — для показа
  if (avatarDemo.on) { admin.is = new URLSearchParams(location.search).has('admin'); return; }
  const id = avUser()?.id || null;
  if (id === admin.uid) return;
  admin.uid = id; admin.is = false;
  if (!id) return;
  sb.rpc('is_admin').then(({ data, error }) => {
    if (admin.uid !== id) return;
    admin.is = !error && data === true;
    if (admin.is && avatarMenu.box) paintAvatarMenu();
  });
}
function adminMenuHTML() {
  return admin.is ? `<button type="button" class="ui-opt backup-opt" data-admin-stats>
      <span class="backup-ico">${CHART_ICON}</span><span class="opt-text">Статистика<small>Видите только вы: числа и список пользователей</small></span></button>` : '';
}

// Запрос чисел. В демо подменяется (js/demo.js)
async function loadAdminStats() {
  const { data, error } = await sb.rpc('admin_stats');
  return error ? { error } : { data };
}

// Список пользователей. В демо подменяется (js/demo.js)
async function loadAdminUsers() {
  const { data, error } = await sb.rpc('admin_users');
  return error ? { error } : { data: Array.isArray(data) ? data : [] };
}

function closeAdminStats() {
  admin.box?.remove(); admin.back?.remove();
  admin.box = admin.back = null;
  admin.users = null; admin.q = '';
}
function statTile(label, value, sub) {
  return `<div class="adm-tile"><span class="adm-label">${escHtml(label)}</span>` +
    `<span class="adm-val">${escHtml(String(value ?? 0))}</span>${sub ? `<span class="adm-sub">${escHtml(sub)}</span>` : ''}</div>`;
}
function adminChartHTML(days) {
  if (!Array.isArray(days) || !days.length) return '';
  const max = Math.max(1, ...days.map(d => Math.max(d.created, d.done)));
  const h = v => Math.round(v / max * 100);
  const cols = days.map(d => {
    const [, m, dd] = d.day.split('-');
    return `<div class="adm-col" title="${escHtml(`${+dd}.${m}: создано ${d.created}, выполнено ${d.done}`)}">` +
      `<div class="adm-bars"><span class="adm-bar new" style="height:${h(d.created)}%"></span><span class="adm-bar done" style="height:${h(d.done)}%"></span></div>` +
      `<span class="adm-day">${+dd}</span></div>`;
  }).join('');
  return `<div class="adm-chart-head"><span>Задачи за 14 дней</span>
      <span class="adm-legend"><i class="new"></i>создано <i class="done"></i>выполнено</span></div>
    <div class="adm-chart" role="img" aria-label="Задачи по дням за 14 дней">${cols}</div>`;
}
function paintAdminStats(res) {
  const body = admin.box?.querySelector('.adm-body');
  if (!body || admin.tab !== 'stats') return;
  if (!res) { body.innerHTML = '<p class="adm-note">Считаем…</p>'; return; }
  if (res.error) { body.innerHTML = `<p class="av-msg" role="alert">Не получилось загрузить: ${escHtml(res.error.message)}</p>`; return; }
  const s = res.data || {};
  const pct = s.users_total ? Math.round(s.tg_linked / s.users_total * 100) + '% от всех' : '';
  body.innerHTML = `<div class="adm-group">Пользователи</div>
    <div class="adm-grid">
      ${statTile('Всего', s.users_total)}
      ${statTile('Новые за сутки', s.users_day)}
      ${statTile('Новые за 7 дней', s.users_week)}
      ${statTile('Заходили за 7 дней', s.active_week)}
      ${statTile('Привязали Telegram', s.tg_linked, pct)}
    </div>
    <div class="adm-group">Задачи</div>
    <div class="adm-grid">
      ${statTile('Всего', s.tasks_total, `${s.tasks_open ?? 0} не выполнено`)}
      ${statTile('Создано за сутки', s.created_day)}
      ${statTile('Создано за 7 дней', s.created_week)}
      ${statTile('Выполнено за сутки', s.done_day)}
      ${statTile('Выполнено за 7 дней', s.done_week)}
    </div>
    ${adminChartHTML(s.days)}
    <p class="adm-note">Только числа: тексты задач и данные людей сюда не попадают.</p>`;
}
async function openAdminStats() {
  closeAvatarMenu(false);
  closeAdminStats();
  admin.back = document.createElement('div');
  admin.back.className = 'ui-backdrop';
  admin.back.addEventListener('click', closeAdminStats);
  const box = document.createElement('div');
  box.className = 'ui-pop adm-pop' + (isSheet() ? ' sheet' : '');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Статистика');
  box.innerHTML = `<div class="adm-top"><h2>Админка</h2>
      <button type="button" class="adm-close" data-adm-refresh aria-label="Обновить" title="Обновить"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button>
      <button type="button" class="adm-close" data-adm-close aria-label="Закрыть"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="adm-tabs" role="tablist" aria-label="Разделы">
      <button type="button" class="pop-chip" role="tab" data-adm-tab="stats">Статистика</button>
      <button type="button" class="pop-chip" role="tab" data-adm-tab="users">Пользователи</button></div>
    <div class="adm-body" role="tabpanel"></div>`;
  box.addEventListener('click', e => {
    const tab = e.target.closest('[data-adm-tab]');
    const sort = e.target.closest('[data-adm-sort]');
    if (e.target.closest('[data-adm-close]')) closeAdminStats();
    else if (e.target.closest('[data-adm-refresh]')) refreshAdmin();
    else if (tab) { admin.tab = tab.dataset.admTab; refreshAdmin(true); }
    else if (sort) { admin.sort = sort.dataset.admSort; paintAdminUsers(); }
  });
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeAdminStats(); } });
  admin.box = box;
  document.body.append(admin.back, box);
  box.querySelector('[data-adm-close]').focus();
  refreshAdmin();
}
// Обновить открытую вкладку; cached — при переключении вкладок не спрашивать список заново
function refreshAdmin(cached) {
  admin.box?.querySelectorAll('[data-adm-tab]').forEach(b => {
    const on = b.dataset.admTab === admin.tab;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
  });
  if (admin.tab === 'users') return cached && admin.users && !admin.users.error ? paintAdminUsers() : refreshAdminUsers();
  refreshAdminStats();
}
async function refreshAdminStats() {
  paintAdminStats(null);
  const res = await loadAdminStats();
  paintAdminStats(res);
}

// ——— Пользователи ———
const ADM_SORTS = [['new', 'Новые'], ['seen', 'Последний вход'], ['tasks', 'Больше задач']];

async function refreshAdminUsers() {
  admin.users = null;
  paintAdminUsers();
  const res = await loadAdminUsers();
  if (!admin.box) return;
  admin.users = res;
  paintAdminUsers();
}
// «сегодня 14:05», «вчера 09:30», «31.10.2026»
function admWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 864e5);
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return 'сегодня ' + hm;
  if (diff === 1) return 'вчера ' + hm;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function admUserName(u) {
  return u.name || (u.email ? u.email.split('@')[0] : '') || (u.tg_username ? '@' + u.tg_username : '') || 'Без имени';
}
function admNick(u) {
  const n = String(u.tg_username || '');
  return /^\w{4,32}$/.test(n) ? n : '';
}
function adminUserRowHTML(u) {
  const nick = admNick(u);
  const contacts = [u.email, nick ? '@' + nick : ''].filter(Boolean).map(escHtml).join(' · ') || 'Вход через Telegram';
  const tags = [
    u.tg ? '<span class="adm-tag ok">Telegram</span>' : '<span class="adm-tag">Без Telegram</span>',
    u.email && !u.confirmed ? '<span class="adm-tag">Почта не подтверждена</span>' : '',
    u.blocked ? '<span class="adm-tag bad">Заблокирован</span>' : '',
  ].join('');
  const seen = admWhen(u.last_sign_in_at);
  return `<li class="adm-user${u.blocked ? ' blocked' : ''}" data-user-id="${escHtml(u.id || '')}">
    <span class="adm-ava" aria-hidden="true">${escHtml(admUserName(u).replace(/^@/, '').charAt(0).toUpperCase() || '?')}</span>
    <div class="adm-user-main">
      <div class="adm-user-name">${escHtml(admUserName(u))}</div>
      <div class="adm-user-sub">${contacts}</div>
      <div class="adm-tags">${tags}</div>
      <div class="adm-user-meta"><span>Регистрация: ${escHtml(admWhen(u.created_at) || '—')}</span>
        <span>Вход: ${escHtml(seen || 'не входил')}</span>
        <span>Задач: ${escHtml(String(u.tasks ?? 0))}${u.tasks ? ` (${escHtml(String(u.tasks_open ?? 0))} не выполн.)` : ''}</span></div>
    </div>
    ${typeof adminUserActionsHTML === 'function' ? adminUserActionsHTML(u) : ''}
  </li>`;
}
function admFiltered() {
  const q = admin.q.trim().toLowerCase();
  const list = (admin.users?.data || []).filter(u => !q ||
    [u.name, u.email, u.tg_username].some(v => String(v || '').toLowerCase().includes(q.replace(/^@/, ''))));
  const t = v => (v ? new Date(v).getTime() : 0) || 0;
  const by = { new: (a, b) => t(b.created_at) - t(a.created_at),
               seen: (a, b) => t(b.last_sign_in_at) - t(a.last_sign_in_at),
               tasks: (a, b) => (b.tasks || 0) - (a.tasks || 0) || t(b.created_at) - t(a.created_at) }[admin.sort];
  return by ? list.sort(by) : list;
}
function paintAdminUsers() {
  const body = admin.box?.querySelector('.adm-body');
  if (!body || admin.tab !== 'users') return;
  const res = admin.users;
  if (!res) { body.innerHTML = '<p class="adm-note">Загружаем список…</p>'; return; }
  if (res.error) {
    const missing = /admin_users/.test(res.error.message || '') && /function|функц|schema cache/i.test(res.error.message || '');
    body.innerHTML = `<p class="av-msg" role="alert">${missing
      ? 'Список ещё не настроен в базе: нужно один раз запустить supabase/14_admin_users.sql.'
      : 'Не получилось загрузить: ' + escHtml(res.error.message)}</p>`;
    return;
  }
  const all = res.data.length, list = admFiltered();
  let search = body.querySelector('.adm-search');
  if (!search) {
    body.innerHTML = `<div class="adm-users-bar">
        <textarea class="one-line adm-search" rows="1" wrap="off" maxlength="80" placeholder="Поиск: имя, почта или @ник" aria-label="Поиск пользователей"></textarea>
        <div class="adm-sorts" role="group" aria-label="Сортировка">${ADM_SORTS.map(([k, l]) =>
          `<button type="button" class="pop-chip" data-adm-sort="${k}">${l}</button>`).join('')}</div></div>
      <p class="adm-count" aria-live="polite"></p><ul class="adm-users"></ul>
      <p class="adm-note">Задачи людей здесь не видны — только их число.</p>`;
    search = body.querySelector('.adm-search');
    search.value = admin.q;
    singleLine(search);
    search.addEventListener('input', () => { admin.q = search.value; paintAdminUsers(); });
  }
  body.querySelectorAll('[data-adm-sort]').forEach(b => {
    const on = b.dataset.admSort === admin.sort;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  });
  body.querySelector('.adm-count').textContent = admin.q.trim()
    ? `Найдено ${list.length} из ${all}` : `Всего ${all}`;
  body.querySelector('.adm-users').innerHTML = list.length
    ? list.map(adminUserRowHTML).join('')
    : `<li class="adm-empty">${all ? 'Никого не нашли' : 'Пользователей пока нет'}</li>`;
}
