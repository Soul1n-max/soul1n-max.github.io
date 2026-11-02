// Статистика для админа: пункт «Статистика» в окне аватара и окно с числами.
// Кто админ, решает база (supabase/13_admin_stats.sql): is_admin() — показать пункт,
// admin_stats() — числа, чужому аккаунту она отвечает ошибкой. Содержимое задач сюда не приходит.

const admin = { uid: null, is: false, box: null, back: null };
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
      <span class="backup-ico">${CHART_ICON}</span><span class="opt-text">Статистика<small>Видите только вы: пользователи и задачи</small></span></button>` : '';
}

// Запрос чисел. В демо подменяется (js/demo.js)
async function loadAdminStats() {
  const { data, error } = await sb.rpc('admin_stats');
  return error ? { error } : { data };
}

function closeAdminStats() {
  admin.box?.remove(); admin.back?.remove();
  admin.box = admin.back = null;
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
  if (!body) return;
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
  box.innerHTML = `<div class="adm-top"><h2>Статистика</h2>
      <button type="button" class="adm-close" data-adm-refresh aria-label="Обновить" title="Обновить"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button>
      <button type="button" class="adm-close" data-adm-close aria-label="Закрыть"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="adm-body"></div>`;
  box.addEventListener('click', e => {
    if (e.target.closest('[data-adm-close]')) closeAdminStats();
    else if (e.target.closest('[data-adm-refresh]')) refreshAdminStats();
  });
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeAdminStats(); } });
  admin.box = box;
  document.body.append(admin.back, box);
  box.querySelector('[data-adm-close]').focus();
  refreshAdminStats();
}
async function refreshAdminStats() {
  paintAdminStats(null);
  const res = await loadAdminStats();
  paintAdminStats(res);
}
