// Интерфейс: вкладки, шапка, тема, быстрое добавление, кнопки

// ═══ MAIN RENDER ═══
function renderAll() {
  renderMeta();
  if (activeTab==='tasks')    renderTasks();
  if (activeTab==='calendar') renderCalendar();
  if (activeTab==='projects') renderProjects();
}

// ═══ TAB SWITCH ═══
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    const on = b.dataset.tab===tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id!=='tab-'+tab);
  renderAll();
}

// ═══ DATE HEADER ═══
function updateHeader() {
  const now = new Date();
  document.getElementById('hdr-date').textContent = `${now.getDate()} ${RU_MONTHS_G[now.getMonth()]}`;
  document.getElementById('hdr-day').textContent = RU_WEEKDAYS[now.getDay()];
}

// ═══ THEME ═══
function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function paintThemeBtn() {
  const btn = document.getElementById('btn-theme');
  const dark = currentTheme() === 'dark';
  btn.innerHTML = dark ? ICON.sun : ICON.moon;
  btn.setAttribute('aria-label', dark ? 'Светлая тема' : 'Тёмная тема');
}
function initTheme() {
  try { const t = localStorage.getItem('spm2_theme'); if(t) document.documentElement.setAttribute('data-theme', t); } catch {}
  paintThemeBtn();
}
document.getElementById('btn-theme').addEventListener('click', () => {
  const next = currentTheme()==='dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  paintThemeBtn();
  try { localStorage.setItem('spm2_theme', next); } catch {}
});

// ═══ QUICK ADD ═══
// Подсказка под полем: что поймёт ввод фразой (phrase.js)
function paintPhrasePreview() {
  const box = document.getElementById('qa-preview');
  const p = parsePhrase(document.getElementById('task-input').value);
  box.hidden = !p.found.length;
  box.innerHTML = p.found.length ? '<span class="qa-preview-k">Поставлю:</span>' +
    p.found.map(f => `<span class="chip">${escHtml(f)}</span>`).join('') : '';
}
// Распознанное во фразе переносим в поля под строкой ввода; остальные поля не трогаем
function applyPhrase(p) {
  const dueEl = document.getElementById('task-due');
  if (p.due) dueEl.value = p.due;
  if (p.time) {
    document.getElementById('task-time').value = p.time;
    // Только время, и оно сегодня уже прошло — значит, завтра (как в боте)
    const now = new Date();
    if (!p.due && dueEl.value === todayKey() && p.time <= `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
      dueEl.value = addDays(todayKey(), 1);
  }
  if (p.projectId) document.getElementById('task-project').value = p.projectId;
  if (p.recur) setRecurField(document.getElementById('task-recur'), p.recur);
  if (p.cat) selectedCat = p.cat;
}

async function doAddTask() {
  clearAuthInputs(); // браузер мог снова подставить сохранённый пароль в скрытую форму
  const input = document.getElementById('task-input');
  if (!input.value.trim()) { input.focus(); return; }
  const phrase = parsePhrase(input.value);
  const text   = phrase.text;
  applyPhrase(phrase);
  const dueEl   = document.getElementById('task-due');
  if (!dueEl.value) dueEl.value = todayKey(); // дата обязательна; без неё задачи приходят только из бота
  const due     = dueEl.value;
  const dueTime = document.getElementById('task-time').value || null;
  const proj    = document.getElementById('task-project').value || null;
  const recur   = document.getElementById('task-recur').value || null;
  const btn     = document.getElementById('btn-add');
  btn.disabled = true;
  btn.textContent = '…';
  const ok = await addTask(text, selectedCat, due, dueTime, proj, recur);
  btn.disabled = false;
  btn.textContent = 'Добавить';
  if (!ok) return; // текст остаётся в поле, чтобы не набирать заново
  input.value = '';
  paintPhrasePreview();
  document.getElementById('task-time').value = '';
  // Повтор, проект и дата из фразы относились только к этой задаче
  if (phrase.recur) document.getElementById('task-recur').value = '';
  if (phrase.projectId) document.getElementById('task-project').value = '';
  if (phrase.due) dueEl.value = dayFilter || todayKey();
  document.querySelectorAll('.tag-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
  selectedCat = null;
  input.focus();
  renderAll();
}
document.getElementById('btn-add').addEventListener('click', doAddTask);
singleLine(document.getElementById('task-input'), doAddTask);
document.getElementById('task-input').addEventListener('input', paintPhrasePreview);
document.getElementById('task-due').value = todayKey();

// ═══ ПОИСК ПО ЛЕНТЕ ═══
// Ищет по тексту и заметке без учёта регистра, вместе с фильтром типа; Esc очищает.
// На телефоне поле свёрнуто в кнопку-лупу и раскрывается на всю ширину, пока в нём ищут.
const searchEl = document.getElementById('task-search');
function setSearch(v) {
  searchEl.value = v;
  searchQuery = v.trim().toLowerCase();
  document.getElementById('search-clear').hidden = !v;
  document.getElementById('feed-tools').classList.toggle('searching', !!v || document.activeElement === searchEl);
  renderTasks();
}
singleLine(searchEl, () => searchEl.blur());
searchEl.addEventListener('input', () => setSearch(searchEl.value));
searchEl.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (searchEl.value) setSearch(''); else searchEl.blur();
});
searchEl.addEventListener('focus', () => document.getElementById('feed-tools').classList.add('searching'));
searchEl.addEventListener('blur', () => document.getElementById('feed-tools').classList.toggle('searching', !!searchEl.value));
document.getElementById('search-clear').addEventListener('click', () => { setSearch(''); searchEl.focus(); });

document.getElementById('qa-more').addEventListener('click', e => {
  const open = e.currentTarget.closest('.quick-add').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', open);
});

document.querySelectorAll('.tag-btn').forEach(btn => {
  btn.setAttribute('aria-pressed', 'false');
  btn.addEventListener('click', () => {
    const cat = btn.dataset.cat;
    const turnOn = selectedCat !== cat;
    document.querySelectorAll('.tag-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    selectedCat = turnOn ? cat : null;
    if (turnOn) { btn.classList.add('active'); btn.setAttribute('aria-pressed','true'); }
  });
});

document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.setAttribute('aria-pressed', btn.classList.contains('active'));
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
    btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
    renderTasks();
  });
});

document.getElementById('done-toggle').addEventListener('click', () => {
  showDone = !showDone;
  document.getElementById('done-list').style.display = showDone ? 'flex' : 'none';
  const tg = document.getElementById('done-toggle');
  tg.classList.toggle('open', showDone);
  tg.setAttribute('aria-expanded', showDone);
  renderTasks();
});

document.getElementById('cal-prev').addEventListener('click', () => {
  calMonth--; if (calMonth < 0) { calMonth=11; calYear--; }
  calSelected = null; renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calMonth++; if (calMonth > 11) { calMonth=0; calYear++; }
  calSelected = null; renderCalendar();
});
document.getElementById('cal-today').addEventListener('click', () => {
  const n = new Date(); calYear = n.getFullYear(); calMonth = n.getMonth(); calSelected = todayKey();
  renderCalendar();
});
document.getElementById('week-to-cal').addEventListener('click', () => switchTab('calendar'));

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('btn-proj-add').addEventListener('click', async () => {
  const n = document.getElementById('proj-name-input').value.trim();
  if (!n) return;
  const btn = document.getElementById('btn-proj-add');
  btn.disabled = true;
  await addProject(n, pickedColor);
  btn.disabled = false;
  document.getElementById('proj-name-input').value = '';
  renderAll();
  updateProjectSelect();
});
singleLine(document.getElementById('proj-name-input'), () => document.getElementById('btn-proj-add').click());


// ═══ BACKUP ═══
// Кнопка в боковом меню: скачать копию (JSON), таблицу (CSV) или загрузить копию обратно
const BACKUP_APP = 'sinergia-planner';
const isUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
const isoOrNull = v => { const d = v == null || v === '' ? null : new Date(v); return d && !isNaN(d) ? d.toISOString() : null; };

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Копия в тех же полях, что и в базе, — её можно загрузить обратно
function exportJSON() {
  const data = {
    app: BACKUP_APP, version: 1, exported_at: new Date().toISOString(),
    projects: projects.map(p => ({ id: p.id, name: p.name, color: p.color, created_at: new Date(p.created).toISOString() })),
    tasks: tasks.map(t => ({
      id: t.id, text: t.text, cat: t.cat, note: t.note || '', done: !!t.done,
      created_at: new Date(t.created).toISOString(), due_date: t.dueDate, due_time: t.dueTime,
      project_id: t.projectId, recur: t.recur, subtasks: t.subtasks || [], done_at: t.doneAt ? new Date(t.doneAt).toISOString() : null,
    })),
  };
  downloadFile(`sinergia-kopiya-${todayKey()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

// Таблица для Excel / Google Таблиц: «;» и BOM, чтобы русский Excel открыл её по столбцам
function exportCSV() {
  const fmtDate = k => k ? k.split('-').reverse().join('.') : '';
  const fmtStamp = ms => ms ? `${fmtDate(dateKey(new Date(ms)))} ${String(new Date(ms).getHours()).padStart(2,'0')}:${String(new Date(ms).getMinutes()).padStart(2,'0')}` : '';
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // текст задачи не должен стать формулой в таблице
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['Задача','Тип','Проект','Дата','Время','Повтор','Выполнена','Когда выполнена','Заметка','Подзадачи','Создана'];
  const rows = [...tasks].sort((a, b) => (a.done - b.done) || byDue(a, b)).map(t => [
    t.text, CATS[t.cat]?.label || '', getProject(t.projectId)?.name || '', fmtDate(t.dueDate), fmtTime(t.dueTime),
    recurLabel(t.recur), t.done ? 'да' : 'нет', fmtStamp(t.doneAt), t.note || '',
    (t.subtasks || []).map(x => (x.done ? '[x] ' : '[ ] ') + x.text).join('\n'), fmtStamp(t.created),
  ]);
  const text = [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
  downloadFile(`sinergia-zadachi-${todayKey()}.csv`, '﻿' + text, 'text/csv;charset=utf-8');
}

// Проверяем каждую строку копии: в базу попадают только известные поля допустимого вида
function backupRows(data) {
  if (!data || data.app !== BACKUP_APP || !Array.isArray(data.tasks)) return null;
  const projIds = {}; // id из файла → id в базе
  const projRows = (Array.isArray(data.projects) ? data.projects : []).flatMap(p => {
    const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 60) : '';
    if (!name) return [];
    const id = isUuid(p.id) ? p.id : uid();
    projIds[p.id] = id;
    return [{ id, name, color: safeColor(p.color), created_at: isoOrNull(p.created_at) || new Date().toISOString() }];
  });
  const known = new Set([...projects.map(p => p.id), ...projRows.map(p => p.id)]);
  const taskRows = data.tasks.flatMap(t => {
    const text = typeof t?.text === 'string' ? t.text.trim().slice(0, 4096) : '';
    if (!text) return [];
    const pid = projIds[t.project_id] || t.project_id;
    const time = /^\d{2}:\d{2}(:\d{2})?$/.test(t.due_time || '') ? t.due_time.slice(0, 5) + ':00' : null;
    return [{
      id:         isUuid(t.id) ? t.id : uid(),
      text,
      cat:        CATS[t.cat] ? t.cat : null,
      note:       typeof t.note === 'string' ? t.note.slice(0, 10000) : '',
      done:       t.done === true,
      created_at: isoOrNull(t.created_at) || new Date().toISOString(),
      due_date:   /^\d{4}-\d{2}-\d{2}$/.test(t.due_date || '') ? t.due_date : null,
      due_time:   time,
      project_id: known.has(pid) ? pid : null,
      recur:      isRecur(t.recur) ? t.recur : null,
      subtasks:   cleanSubtasks(t.subtasks),
      done_at:    t.done === true ? isoOrNull(t.done_at) : null,
    }];
  });
  return { projRows, taskRows };
}

async function importJSON(file) {
  let data = null;
  try { data = JSON.parse(await file.text()); } catch {}
  const rows = backupRows(data);
  if (!rows) { alert('Это не копия планера. Выберите файл sinergia-kopiya-….json, скачанный кнопкой «Скачать копию».'); return; }
  const { projRows, taskRows } = rows;
  if (!taskRows.length && !projRows.length) { alert('В копии нет задач и проектов.'); return; }
  if (!confirm(`В копии задач: ${taskRows.length}, проектов: ${projRows.length}.\n` +
    'Добавить в планер те, которых сейчас нет? Задачи, которые уже есть, не изменятся.')) return;
  setSyncStatus('loading');
  const added = await importBackup(projRows, taskRows);
  await loadProjects(); updateProjectSelect();
  await loadTasks(); renderAll();
  if (added) alert(`Готово. Добавлено задач: ${added.tasks}, проектов: ${added.projects}.` +
    (added.tasks < taskRows.length ? `\nОстальные ${taskRows.length - added.tasks} уже были в планере.` : ''));
}

// Меню у кнопки: на телефоне — снизу листом, на компьютере — рядом с кнопкой
const backupMenu = { box: null, back: null };
function closeBackupMenu(returnFocus) {
  if (!backupMenu.box) return;
  backupMenu.box.remove();
  if (backupMenu.back) backupMenu.back.remove();
  backupMenu.box = backupMenu.back = null;
  const btn = document.getElementById('btn-backup');
  btn.setAttribute('aria-expanded', 'false');
  if (returnFocus) btn.focus();
}
function openBackupMenu() {
  const btn = document.getElementById('btn-backup');
  const sheet = isSheet();
  if (sheet) {
    backupMenu.back = document.createElement('div');
    backupMenu.back.className = 'ui-backdrop';
    backupMenu.back.addEventListener('click', () => closeBackupMenu(true));
    document.body.appendChild(backupMenu.back);
  }
  const box = document.createElement('div');
  box.className = 'ui-pop backup-menu' + (sheet ? ' sheet' : '');
  box.setAttribute('role', 'menu');
  box.setAttribute('aria-label', 'Копия задач');
  const item = (act, icon, text, hint) => `<button type="button" class="ui-opt backup-opt" role="menuitem" data-act="${act}">` +
    `<span class="backup-ico">${icon}</span><span class="opt-text">${text}<small>${hint}</small></span></button>`;
  box.innerHTML = '<div class="ui-pop-title">Копия задач</div>' +
    item('json', ICON.down,  'Скачать копию',   'Все задачи и проекты, файл .json') +
    item('csv',  ICON.table, 'Скачать таблицу', 'Для Excel и Google Таблиц, .csv') +
    item('load', ICON.up,    'Загрузить копию', 'Вернуть задачи из файла .json');
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    closeBackupMenu(false);
    if (b.dataset.act === 'json') exportJSON();
    else if (b.dataset.act === 'csv') exportCSV();
    else document.getElementById('backup-file').click();
  });
  box.addEventListener('keydown', e => {
    const items = [...box.querySelectorAll('[data-act]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeBackupMenu(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  backupMenu.box = box;
  document.body.appendChild(box);
  btn.setAttribute('aria-expanded', 'true');
  if (!sheet) {
    // На компьютере кнопка внизу меню — окно над ней; в шапке телефона — под ней
    const r = btn.getBoundingClientRect(), w = 300;
    box.style.width = w + 'px';
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    if (r.top > innerHeight / 2) box.style.bottom = (innerHeight - r.top + 8) + 'px';
    else box.style.top = (r.bottom + 8) + 'px';
  }
  box.querySelector('[data-act]').focus();
}
document.getElementById('btn-backup').innerHTML = ICON.down;
document.getElementById('btn-backup').addEventListener('click', () => {
  if (backupMenu.box) closeBackupMenu(false); else openBackupMenu();
});
document.addEventListener('mousedown', e => {
  if (backupMenu.box && !backupMenu.box.contains(e.target) && !e.target.closest('#btn-backup')) closeBackupMenu(false);
});
document.getElementById('backup-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) await importJSON(file);
});
