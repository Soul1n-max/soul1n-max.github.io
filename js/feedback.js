// Обратная связь: «Ошибка или пожелание» в окне аватара — у всех, «Отзывы» — только у админа.
// Всё через функции базы (supabase/18_feedback.sql): send_feedback() — отправить,
// admin_feedback() и admin_feedback_status() — список и «Решено», чужому аккаунту они отвечают ошибкой.

const fb = { box: null, back: null, kind: 'bug', busy: false, sent: false, msg: '', list: null, filter: 'new' };
const FB_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M12 8v4M12 15.5v.01"/></svg>';
const INBOX_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/></svg>';
const FB_KINDS = { bug: 'Ошибка', idea: 'Пожелание' };

function feedbackMenuHTML() {
  const mine = `<button type="button" class="ui-opt backup-opt" data-fb-open>
      <span class="backup-ico">${FB_ICON}</span><span class="opt-text">Ошибка или пожелание<small>Напишите, что сломалось или чего не хватает</small></span></button>`;
  const inbox = typeof admin !== 'undefined' && admin.is ? `<button type="button" class="ui-opt backup-opt" data-fb-inbox>
      <span class="backup-ico">${INBOX_ICON}</span><span class="opt-text">Отзывы<small>Видите только вы: ошибки и пожелания людей</small></span></button>` : '';
  return mine + inbox;
}

// Запросы к базе. В демо подменяются (js/demo.js)
async function sendFeedback(kind, text) {
  const { error } = await sb.rpc('send_feedback', {
    p_kind: kind, p_text: text,
    p_page: (location.pathname + location.search).slice(0, 300),
    p_device: navigator.userAgent.slice(0, 300),
  });
  return error || null;
}
async function loadFeedback() {
  const { data, error } = await sb.rpc('admin_feedback');
  return error ? { error } : { data: Array.isArray(data) ? data : [] };
}
async function setFeedbackStatus(id, status) {
  const { error } = await sb.rpc('admin_feedback_status', { p_id: id, p_status: status });
  return error || null;
}

const FB_CLOSE_BTN = '<button type="button" class="adm-close" data-fb-close aria-label="Закрыть"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';

function closeFeedback() {
  fb.box?.remove(); fb.back?.remove();
  fb.box = fb.back = null;
}
function makeFeedbackBox(label, onClick) {
  closeAvatarMenu(false);
  closeFeedback();
  fb.back = document.createElement('div');
  fb.back.className = 'ui-backdrop';
  fb.back.addEventListener('click', closeFeedback);
  const box = document.createElement('div');
  box.className = 'ui-pop adm-pop fb-pop' + (isSheet() ? ' sheet' : '');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', label);
  box.addEventListener('click', e => { if (e.target.closest('[data-fb-close]')) closeFeedback(); else onClick(e); });
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeFeedback(); } });
  fb.box = box;
  document.body.append(fb.back, box);
  return box;
}

// ═══ Форма для всех ═══
function openFeedbackForm() {
  fb.kind = 'bug'; fb.sent = false; fb.msg = ''; fb.busy = false;
  const box = makeFeedbackBox('Ошибка или пожелание', onFeedbackFormClick);
  paintFeedbackForm();
  box.querySelector('.fb-text')?.focus();
}
function paintFeedbackForm(keepText) {
  const box = fb.box;
  if (!box) return;
  const old = box.querySelector('.fb-text')?.value ?? '';
  if (fb.sent) {
    box.innerHTML = `<div class="adm-top"><h2>Спасибо!</h2>${FB_CLOSE_BTN}</div>
      <p class="fb-done">Сообщение отправлено. Мы его прочитаем и, если нужно, напишем вам на почту или в Telegram.</p>
      <div class="fb-actions"><button type="button" class="fb-send" data-fb-more>Написать ещё</button></div>`;
    box.querySelector('[data-fb-more]').focus();
    return;
  }
  const kindBtn = k => `<button type="button" class="fb-kind" data-fb-kind="${k}" aria-pressed="${fb.kind === k}">${FB_KINDS[k]}</button>`;
  box.innerHTML = `<div class="adm-top"><h2>Ошибка или пожелание</h2>${FB_CLOSE_BTN}</div>
    <div class="fb-kinds" role="group" aria-label="Что хотите сообщить">${kindBtn('bug')}${kindBtn('idea')}</div>
    <textarea class="fb-text" rows="5" maxlength="2000" aria-label="Текст сообщения" placeholder="${fb.kind === 'bug'
      ? 'Что случилось? Что вы делали перед этим?' : 'Чего не хватает в планере?'}"></textarea>
    <p class="adm-note">Сообщение увидит только администратор планера, вместе с вашим именем и почтой, чтобы ответить вам.</p>
    ${fb.msg ? `<p class="av-msg" role="alert">${escHtml(fb.msg)}</p>` : ''}
    <div class="fb-actions"><button type="button" class="fb-send" data-fb-send ${fb.busy ? 'disabled' : ''}>${fb.busy ? 'Отправляем…' : 'Отправить'}</button></div>`;
  const ta = box.querySelector('.fb-text');
  if (keepText) ta.value = old;
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitFeedback(); } });
}
function onFeedbackFormClick(e) {
  const k = e.target.closest('[data-fb-kind]');
  if (k && !fb.busy) { fb.kind = k.dataset.fbKind; paintFeedbackForm(true); fb.box.querySelector(`[data-fb-kind="${fb.kind}"]`).focus(); return; }
  if (e.target.closest('[data-fb-send]')) { submitFeedback(); return; }
  if (e.target.closest('[data-fb-more]')) { fb.sent = false; fb.msg = ''; paintFeedbackForm(); fb.box.querySelector('.fb-text').focus(); }
}
async function submitFeedback() {
  const ta = fb.box?.querySelector('.fb-text');
  if (!ta || fb.busy) return;
  const text = ta.value.trim();
  if (!text) { fb.msg = 'Напишите пару слов о том, что случилось или чего хочется.'; paintFeedbackForm(true); fb.box.querySelector('.fb-text').focus(); return; }
  fb.busy = true; fb.msg = '';
  paintFeedbackForm(true);
  const err = await sendFeedback(fb.kind, text);
  fb.busy = false;
  if (!fb.box) return;
  if (err) { fb.msg = 'Не отправилось: ' + err.message; paintFeedbackForm(true); return; }
  fb.sent = true;
  paintFeedbackForm();
}

// ═══ Отзывы для админа ═══
function openFeedbackInbox() {
  fb.list = null; fb.msg = ''; fb.filter = 'new';
  makeFeedbackBox('Отзывы', onFeedbackInboxClick);
  paintFeedbackInbox();
  fb.box.querySelector('[data-fb-close]').focus();
  refreshFeedbackInbox();
}
async function refreshFeedbackInbox() {
  fb.list = null; paintFeedbackInbox();
  const res = await loadFeedback();
  if (!fb.box) return;
  fb.list = res;
  paintFeedbackInbox();
}
function fbDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
function fbDevice(ua) {
  ua = String(ua || '');
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Telegram/.test(ua) ? 'Telegram' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(', ');
}
function paintFeedbackInbox() {
  const box = fb.box;
  if (!box) return;
  const refresh = `<button type="button" class="adm-close" data-fb-refresh aria-label="Обновить" title="Обновить"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button>`;
  let body;
  const res = fb.list;
  if (!res) body = '<p class="adm-note">Загружаем…</p>';
  else if (res.error) body = `<p class="av-msg" role="alert">Не получилось загрузить: ${escHtml(res.error.message)}</p>`;
  else {
    const all = res.data;
    const fresh = all.filter(f => f.status === 'new').length;
    const shown = fb.filter === 'new' ? all.filter(f => f.status === 'new') : all;
    const tab = (k, label) => `<button type="button" class="fb-kind" data-fb-filter="${k}" aria-pressed="${fb.filter === k}">${label}</button>`;
    const items = shown.map(f => {
      const who = [f.name, f.email, f.tg_username ? '@' + f.tg_username : ''].filter(Boolean).join(' · ') || 'Аккаунт удалён';
      const meta = [fbDate(f.created_at), fbDevice(f.device)].filter(Boolean).join(' · ');
      const done = f.status === 'done';
      return `<li class="fb-item${done ? ' done' : ''}">
        <div class="fb-item-head"><span class="fb-tag ${f.kind === 'bug' ? 'bug' : 'idea'}">${escHtml(FB_KINDS[f.kind] || f.kind)}</span>
          <span class="fb-meta">${escHtml(meta)}</span></div>
        <p class="fb-item-text">${escHtml(f.text)}</p>
        <div class="fb-item-foot"><span class="fb-who">${escHtml(who)}</span>
          <button type="button" class="fb-status" data-fb-status="${escHtml(f.id)}" data-to="${done ? 'new' : 'done'}">${done ? 'Вернуть в новые' : 'Решено'}</button></div>
      </li>`;
    }).join('');
    body = `<div class="fb-kinds" role="group" aria-label="Какие показать">${tab('new', `Новые · ${fresh}`)}${tab('all', `Все · ${all.length}`)}</div>
      ${fb.msg ? `<p class="av-msg" role="alert">${escHtml(fb.msg)}</p>` : ''}
      ${items ? `<ul class="fb-list">${items}</ul>` : `<p class="adm-note">${fb.filter === 'new' ? 'Новых сообщений нет.' : 'Пока никто ничего не написал.'}</p>`}`;
  }
  box.innerHTML = `<div class="adm-top"><h2>Отзывы</h2>${refresh}${FB_CLOSE_BTN}</div><div class="adm-body">${body}</div>`;
}
async function onFeedbackInboxClick(e) {
  if (e.target.closest('[data-fb-refresh]')) { refreshFeedbackInbox(); return; }
  const tab = e.target.closest('[data-fb-filter]');
  if (tab) { fb.filter = tab.dataset.fbFilter; paintFeedbackInbox(); fb.box.querySelector(`[data-fb-filter="${fb.filter}"]`).focus(); return; }
  const st = e.target.closest('[data-fb-status]');
  if (!st || st.disabled || !fb.list?.data) return;
  const item = fb.list.data.find(f => f.id === st.dataset.fbStatus);
  if (!item) return;
  st.disabled = true;
  const err = await setFeedbackStatus(item.id, st.dataset.to);
  if (!fb.box) return;
  if (err) fb.msg = 'Не сохранилось: ' + err.message;
  else { item.status = st.dataset.to; fb.msg = ''; }
  paintFeedbackInbox();
}
