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
async function doAddTask() {
  clearAuthInputs(); // браузер мог снова подставить сохранённый пароль в скрытую форму
  const input = document.getElementById('task-input');
  const text  = input.value.trim();
  if (!text) { input.focus(); return; }
  const due     = document.getElementById('task-due').value || null;
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
  document.getElementById('task-time').value = '';
  document.querySelectorAll('.tag-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
  selectedCat = null;
  input.focus();
  renderAll();
}
document.getElementById('btn-add').addEventListener('click', doAddTask);
document.getElementById('task-input').addEventListener('keydown', e => { if (e.key==='Enter') doAddTask(); });

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
document.getElementById('proj-name-input').addEventListener('keydown', e => {
  if (e.key==='Enter') document.getElementById('btn-proj-add').click();
});

