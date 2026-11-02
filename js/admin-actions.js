// Блокировка и удаление аккаунта из админки: кнопка «Действия» в строке пользователя (вкладка «Пользователи»).
// Решает база (supabase/16_admin_block_delete.sql): admin_block_user / admin_unblock_user / admin_delete_user
// проверяют, что вызывает админ, и не дают тронуть себя и других админов. Строку рисует adminUserRowHTML()
// в admin.js и вызывает отсюда adminUserActionsHTML(u); после действия список перечитывается.

// open — id пользователя с открытой панелью, mode — menu | block | delete, busy — ждём базу
const admAct = { open: null, mode: 'menu', busy: false, err: '', flash: '', box: null };
const DOTS_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const LOCK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const UNLOCK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
const BIN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

// Запрос к базе. В демо подменяется (js/demo.js)
async function adminUserAction(kind, id, reason) {
  const call = { block: ['admin_block_user', { p_user: id, p_reason: reason || null }],
                 unblock: ['admin_unblock_user', { p_user: id }],
                 remove: ['admin_delete_user', { p_user: id }] }[kind];
  const { data, error } = await sb.rpc(call[0], call[1]);
  return error ? { error } : { data };
}

function adminUserActionsHTML(u) {
  if (!u.id || u.id === admin.uid) return '';  // себя не блокируем и не удаляем
  if (admAct.box !== admin.box) Object.assign(admAct, { open: null, mode: 'menu', busy: false, err: '', box: admin.box });
  const open = admAct.open === u.id;
  const name = escHtml(admUserName(u));
  const btn = `<button type="button" class="adm-act-btn${open ? ' on' : ''}" data-act="toggle" aria-expanded="${open}"
      aria-label="Действия: ${name}" title="Действия">${DOTS_ICON}</button>`;
  if (!open) return btn;
  const busy = admAct.busy ? ' disabled' : '';
  const err = admAct.err ? `<p class="av-msg" role="alert">${escHtml(admAct.err)}</p>` : '';
  let panel;
  if (admAct.mode === 'block') {
    panel = `<p class="adm-act-q">Заблокировать ${name}? Человек не сможет войти на сайт, его выкинет из всех браузеров
        (открытая вкладка — не дольше часа), бот перестанет принимать от него задачи. Данные сохранятся, блокировку можно снять.</p>
      <textarea class="one-line adm-act-reason" rows="1" wrap="off" maxlength="300" placeholder="Причина, если нужно (видите только вы)" aria-label="Причина блокировки"></textarea>
      <div class="adm-act-row"><button type="button" class="adm-act-go danger" data-act="block-yes"${busy}>${LOCK_ICON}Да, заблокировать</button>
        <button type="button" class="adm-act-go" data-act="back"${busy}>Отмена</button></div>`;
  } else if (admAct.mode === 'delete') {
    const tasks = u.tasks ? `все его задачи (${escHtml(String(u.tasks))}), проекты, файлы` : 'проекты, файлы';
    panel = `<p class="adm-act-q"><b>Удалить ${name} навсегда?</b> Сотрём аккаунт, ${tasks}, аватар и настройки.
        Вернуть будет нельзя.${u.blocked ? ' Блокировка Telegram останется: заново через него войти и писать боту не получится.'
        : ' Человек сможет зарегистрироваться заново. Если это спам — сначала заблокируйте.'}</p>
      <div class="adm-act-row"><button type="button" class="adm-act-go danger" data-act="delete-yes"${busy}>${BIN_ICON}Да, удалить навсегда</button>
        <button type="button" class="adm-act-go" data-act="back"${busy}>Отмена</button></div>`;
  } else {
    panel = `<div class="adm-act-row">${u.blocked
        ? `<button type="button" class="adm-act-go" data-act="unblock"${busy}>${UNLOCK_ICON}Разблокировать</button>`
        : `<button type="button" class="adm-act-go" data-act="block">${LOCK_ICON}Заблокировать</button>`}
        <button type="button" class="adm-act-go danger" data-act="delete">${BIN_ICON}Удалить аккаунт</button></div>`;
  }
  return `${btn}<div class="adm-act-panel">${panel}${err}</div>`;
}

function admActRepaint(focusSel) {
  paintAdminUsers();
  const row = admAct.open && [...(admin.box?.querySelectorAll('.adm-user') || [])].find(li => li.dataset.userId === admAct.open);
  const reason = row?.querySelector('.adm-act-reason');
  if (reason) singleLine(reason, () => row.querySelector('[data-act="block-yes"]')?.click());
  (row?.querySelector(focusSel) || row?.querySelector('[data-act="toggle"]'))?.focus();
}
function admShowFlash() {
  const count = admin.box?.querySelector('.adm-count');
  if (!count || !admAct.flash) return;
  const p = document.createElement('p');
  p.className = 'adm-flash'; p.setAttribute('role', 'status');
  p.textContent = admAct.flash;
  count.before(p);
  admAct.flash = '';
}

async function admRun(kind, id, reason) {
  admAct.busy = true; admAct.err = '';
  admActRepaint('[data-act="back"]');
  const res = await adminUserAction(kind, id, reason);
  admAct.busy = false;
  if (res.error) {
    const msg = res.error.message || '';
    admAct.err = /admin_(block|unblock|delete)_user/.test(msg) && /function|функц|schema cache/i.test(msg)
      ? 'Ещё не настроено в базе: нужно один раз запустить supabase/16_admin_block_delete.sql.'
      : 'Не получилось: ' + msg;
    admActRepaint('[data-act="back"]');
    return;
  }
  const u = (admin.users?.data || []).find(x => x.id === id);
  const name = u ? admUserName(u) : 'Пользователь';
  admAct.flash = kind === 'remove'
    ? `${name}: аккаунт удалён${res.data?.tasks ? `, стёрто задач: ${res.data.tasks}` : ''}.`
    : kind === 'block' ? `${name} заблокирован.` : `${name} разблокирован.`;
  admAct.open = null; admAct.mode = 'menu';
  await refreshAdminUsers();
  admShowFlash();
}

document.addEventListener('click', e => {
  const b = e.target.closest('.adm-pop [data-act]');
  if (!b || b.disabled) return;
  const id = b.closest('.adm-user')?.dataset.userId;
  if (!id) return;
  const act = b.dataset.act;
  admAct.err = '';
  if (act === 'toggle') {
    if (admAct.busy) return;
    const was = admAct.open === id;
    admAct.open = was ? null : id; admAct.mode = 'menu';
    return admActRepaint(was ? '[data-act="toggle"]' : '.adm-act-go');
  }
  if (act === 'back') { admAct.mode = 'menu'; return admActRepaint('.adm-act-go'); }
  if (act === 'block') { admAct.mode = 'block'; return admActRepaint('.adm-act-reason'); }
  if (act === 'delete') { admAct.mode = 'delete'; return admActRepaint('[data-act="back"]'); }
  if (admAct.busy) return;
  if (act === 'block-yes') admRun('block', id, b.closest('.adm-act-panel')?.querySelector('.adm-act-reason')?.value.trim());
  else if (act === 'unblock') admRun('unblock', id);
  else if (act === 'delete-yes') admRun('remove', id);
});
