// Отрисовка: карточка задачи, список, неделя, календарь, проекты, сетка месяца, перетаскивание

// ═══ TASK ELEMENT ═══
function makeTaskEl(task) {
  const cat  = task.cat ? CATS[task.cat] : null;
  const proj = task.projectId ? getProject(task.projectId) : null;
  const dueInfo = formatDue(task.dueDate);
  const timeStr = fmtTime(task.dueTime);
  const due = dueInfo ? { label: dueInfo.label + (timeStr ? ' · ' + timeStr : ''), cls: dueInfo.cls }
            : timeStr ? { label: 'в ' + timeStr, cls: 'future' } : null;
  const isOvrd     = task.dueDate && task.dueDate < todayKey() && !task.done;
  const isDueToday = task.dueDate === todayKey() && !task.done;

  const div = document.createElement('div');
  let cls = 'task-item';
  if (task.done) cls += ' done';
  else if (isOvrd) cls += ' overdue';
  else if (isDueToday) cls += ' due-today';
  div.className = cls;
  div.dataset.id = task.id;

  const catTag   = cat  ? `<span class="chip task-tag ${cat.cls}">${cat.label}</span>` : '';
  const dueTag   = due  ? `<span class="chip task-due-tag ${due.cls}">${due.label}</span>` : '';
  const recurTag = task.recur ? `<span class="chip task-recur-tag">↻ ${escHtml(recurLabel(task.recur))}</span>` : '';
  const subs     = task.subtasks || [];
  const subsDone = subs.filter(x => x.done).length;
  const subTag   = subs.length ? `<span class="chip task-sub-tag${subsDone === subs.length ? ' all' : ''}" title="Подзадачи: выполнено ${subsDone} из ${subs.length}">${ICON.list}${subsDone}/${subs.length}</span>` : '';
  const subList  = subs.length && !task.done ? `<ul class="subtasks" aria-label="Подзадачи">${subs.map(x =>
    `<li><button type="button" class="sub-item${x.done ? ' done' : ''}" role="checkbox" aria-checked="${x.done}" data-sub="${escHtml(x.id)}">` +
    `<span class="box">${ICON.check}</span><span class="sub-text">${escHtml(x.text)}</span></button></li>`).join('')}</ul>` : '';
  const projTag  = proj ? `<span class="chip task-proj-tag"><span class="dot" style="background:${proj.color}"></span>${escHtml(proj.name)}</span>` : '';
  const opt = (v, label, cur, dot) => `<option value="${v}"${v === cur ? ' selected' : ''}${dot ? ` data-dot="${escHtml(dot)}"` : ''}>${escHtml(label)}</option>`;
  const catOptions   = Object.entries(CATS).map(([k, c]) => opt(k, c.label, task.cat, `var(--c-${k})`)).join('');
  const projOptions  = projects.map(p => opt(p.id, p.name, task.projectId, p.color)).join('');
  const recurOptions = recurOptionsHTML(task.recur);

  div.innerHTML = `
    <button class="task-check" role="checkbox" aria-checked="${task.done}" aria-label="${task.done ? 'Вернуть в работу' : 'Отметить выполненной'}">
      <span class="box">${ICON.check}</span>
    </button>
    <div class="task-body">
      <div class="task-text">${escHtml(task.text)}</div>
      ${subList}
      ${task.note ? `<div class="task-note-preview">${escHtml(task.note)}</div>` : ''}
      <div class="task-footer">${catTag}${dueTag}${recurTag}${subTag}${projTag}</div>
      <!-- «Да, выполнена» стоит прямо под галочкой: второе нажатие — в том же месте, что и первое -->
      <div class="done-confirm" role="group" aria-label="Отметить выполненной?">
        <button type="button" class="btn-sm primary" data-done-yes>Да, выполнена</button>
        <button type="button" class="btn-sm" data-done-no>Нет</button>
        <span>Отметить выполненной?</span>
      </div>
      <form class="note-row" id="nr-${task.id}" autocomplete="off">
        <label class="sr-only" for="et-${task.id}">Название</label>
        <textarea class="edit-text one-line" id="et-${task.id}" rows="1" wrap="off" maxlength="300" autocomplete="off">${escHtml(task.text)}</textarea>
        <div class="extra-row edit-fields">
          <select class="ui-field" data-label="Тип" id="ec-${task.id}"><option value="">Без типа</option>${catOptions}</select>
          <input type="date" class="ui-field" data-label="Дата" id="ed-${task.id}" value="${task.dueDate || ''}"${task.dueDate ? ' data-required' : ''}>
          <input type="time" class="ui-field" data-label="Время" id="eh-${task.id}" value="${fmtTime(task.dueTime)}">
          <select class="ui-field" data-label="Проект" id="ep-${task.id}"><option value="">Без проекта</option>${projOptions}</select>
          <select class="ui-field" data-label="Повтор" id="er-${task.id}"><option value="">Нет</option>${recurOptions}</select>
        </div>
        <div class="sub-edit" role="group" aria-label="Подзадачи">
          <div class="sub-edit-title">Подзадачи</div>
          <div class="sub-edit-list"></div>
          <div class="sub-row">
            <label class="sr-only" for="sn-${task.id}">Новая подзадача</label>
            <textarea class="sub-new one-line" id="sn-${task.id}" rows="1" wrap="off" maxlength="200" placeholder="Добавить шаг…" autocomplete="off"></textarea>
            <button type="button" class="sub-btn" data-sub-add aria-label="Добавить шаг">${ICON.plus}</button>
          </div>
        </div>
        <label class="sr-only" for="ni-${task.id}">Заметка</label>
        <textarea class="note-input" id="ni-${task.id}" rows="3" placeholder="Заметка…" autocomplete="off">${escHtml(task.note||'')}</textarea>
        <div class="note-save-row">
          <button class="btn-sm" data-close="${task.id}">Отмена</button>
          <button class="btn-sm primary" data-save="${task.id}">Сохранить</button>
        </div>
      </form>
    </div>
    <div class="task-actions">
      <button aria-label="Изменить" title="Изменить" data-note="${task.id}">${ICON.note}</button>
      <button class="btn-delete" aria-label="Удалить" title="Удалить" data-del="${task.id}">${ICON.trash}</button>
    </div>`;

  // Одна задача бывает в DOM дважды (скрытая вкладка и открытая), поэтому ищем поля только в своей карточке
  const own = id => div.querySelector('#' + CSS.escape(id));
  div.querySelectorAll('.ui-field').forEach(uiField);
  // Активную задачу можно перетащить на день календаря (drag.js); пока открыта форма, тянуть нельзя
  // Выполнение подтверждается, чтобы случайный клик не закрыл задачу; вернуть в работу можно сразу
  div.querySelector('.task-check').addEventListener('click', async () => {
    if (!task.done) { div.classList.toggle('confirming'); return; }
    await toggleDone(task.id); renderAll();
  });
  div.querySelector('[data-done-no]').addEventListener('click', () => div.classList.remove('confirming'));
  div.querySelector('[data-done-yes]').addEventListener('click', async () => { await toggleDone(task.id); renderAll(); });
  // Подзадачи отмечаются прямо в карточке
  div.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', async () => {
    const list = subs.map(x => x.id === b.dataset.sub ? { ...x, done: !x.done } : x);
    b.classList.toggle('done'); b.setAttribute('aria-checked', b.classList.contains('done'));
    await saveTask(task.id, { subtasks: list });
    renderAll();
  }));
  // Подзадачи в форме правки: черновик живёт, пока форма открыта, в базу уходит по «Сохранить»
  let draft = [];
  const subBox = div.querySelector('.sub-edit-list');
  const paintDraft = () => {
    subBox.innerHTML = draft.map((x, i) => `<div class="sub-row">
      <label class="sr-only" for="se-${task.id}-${i}">Подзадача ${i + 1}</label>
      <textarea class="sub-in one-line" id="se-${task.id}-${i}" rows="1" wrap="off" maxlength="200" autocomplete="off" data-i="${i}">${escHtml(x.text)}</textarea>
      <button type="button" class="sub-btn" data-sub-rm="${i}" aria-label="Убрать шаг «${escHtml(x.text)}»">${ICON.close}</button></div>`).join('');
    subBox.querySelectorAll('.sub-in').forEach(el => {
      singleLine(el, () => own('sn-'+task.id).focus());
      el.addEventListener('input', () => { draft[+el.dataset.i].text = el.value; });
    });
  };
  subBox.addEventListener('click', e => {
    const rm = e.target.closest('[data-sub-rm]');
    if (!rm) return;
    draft.splice(+rm.dataset.subRm, 1);
    paintDraft();
    own('sn-'+task.id).focus();
  });
  const addDraft = () => {
    const el = own('sn-'+task.id), text = el.value.trim();
    if (!text || draft.length >= SUBTASKS_MAX) { el.focus(); return; }
    draft.push({ id: uid(), text, done: false });
    el.value = '';
    paintDraft();
    el.focus();
  };
  singleLine(own('sn-'+task.id), addDraft);
  div.querySelector('[data-sub-add]').addEventListener('click', addDraft);
  div.querySelector('[data-note]').addEventListener('click', () => {
    const row = own('nr-'+task.id);
    row.classList.toggle('open');
    if (row.classList.contains('open')) {
      draft = subs.map(x => ({ ...x }));
      paintDraft();
      own('et-'+task.id).focus();
    }
  });
  div.querySelector('[data-save]').addEventListener('click', async () => {
    const v = id => own(id + '-' + task.id).value;
    const text = v('et').trim();
    if (!text) { own('et-'+task.id).focus(); return; }
    const time = v('eh');
    // Недописанный шаг в поле «Добавить шаг» тоже сохраняем
    if (own('sn-'+task.id).value.trim()) addDraft();
    const fields = {
      text,
      cat:        v('ec') || null,
      due_date:   v('ed') || null,
      due_time:   time ? time + ':00' : null,
      project_id: v('ep') || null,
      recur:      v('er') || null,
      note:       v('ni').trim(),
    };
    if (subs.length || draft.length) fields.subtasks = cleanSubtasks(draft);
    await saveTask(task.id, fields);
    renderAll();
  });
  singleLine(own('et-'+task.id), () => div.querySelector('[data-save]').click());
  div.querySelector('[data-close]').addEventListener('click', () => {
    own('nr-'+task.id).classList.remove('open');
  });
  // Удаление сразу, без вопроса: вернуть задачу можно кнопкой «Отменить» в уведомлении внизу (drag.js)
  div.querySelector('[data-del]').addEventListener('click', async () => {
    const row = await deleteTask(task.id);
    renderAll();
    if (row) showDeleteToast(row);
  });
  if (task.note) {
    div.querySelector('.task-note-preview').addEventListener('click', function(){ this.classList.toggle('expanded'); });
  }
  return div;
}

function sectionHead(text, count, extraCls) {
  const el = document.createElement('div');
  el.className = 'section-head' + (extraCls ? ' ' + extraCls : '');
  el.innerHTML = `${escHtml(text)} <span class="cnt">${count}</span>`;
  return el;
}

// ═══ RENDER META (прогресс, счётчики, боковое меню) ═══
function renderMeta() {
  // Прогресс за сегодня, как и фраза Ивана: сделано сегодня из (оставшихся на сегодня + сделанных сегодня)
  const today     = todayKey();
  const allActive = tasks.filter(t => !t.done);
  const leftToday = allActive.filter(t => t.dueDate === today).length;
  const doneToday = tasks.filter(t => t.done && t.doneAt && dateKey(new Date(t.doneAt)) === today).length;
  const total = leftToday + doneToday;
  const pct   = total ? Math.round(doneToday / total * 100) : 0;
  document.getElementById('prog-text').innerHTML = `${doneToday} <span style="color:var(--fg-muted);font-weight:500">из ${total}</span>`;
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('nav-count-tasks').textContent = allActive.length || '';
  document.getElementById('nav-count-projects').textContent = projects.length || '';
  renderSideProjects();
  renderMascot();
}

// ═══ МАСКОТ ИВАН И СЕРИЯ ДНЕЙ ═══
// Серия — дни подряд, в которые выполнена хотя бы одна задача (по done_at).
// Если сегодня ещё ничего не сделано, серия до вчерашнего дня не сгорает.

function calcStreak() {
  const days = new Set(tasks.filter(t => t.done && t.doneAt).map(t => dateKey(new Date(t.doneAt))));
  const d = new Date();
  if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dateKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const STREAK_GOALS = [3, 7, 14, 21, 30, 50, 100, 200, 365];

// После каждой выполненной задачи Иван меняет образ: номер образа = сколько задач сделано сегодня
const MASCOT_CHEERS = [
  { pose: 'growth',   say: 'Растём!' },
  { pose: 'graduate', say: 'Отличник!' },
  { pose: 'robot',    say: 'Работаешь как робот!' },
  { pose: 'tongue',   say: 'Легко!' },
  { pose: 'hoodie',   say: 'Ты в ударе!' },
  { pose: 'tablets',  say: 'Старое долой, новое в работу!' },
  { pose: 'cap',      say: 'Красиво закрыл!' },
  { pose: 'thumb',    say: 'Так держать!' },
];

let mascotAllDoneAt = null;   // сколько было сделано, когда всё на сегодня закрылось

function mascotState() {
  const today = todayKey();
  const active    = tasks.filter(t => !t.done);
  const overdue   = active.filter(t => t.dueDate && t.dueDate < today).length;
  const leftToday = active.filter(t => t.dueDate === today).length;
  const doneToday = tasks.filter(t => t.done && t.doneAt && dateKey(new Date(t.doneAt)) === today).length;
  const streak = calcStreak();
  const zadach = n => n + ' ' + plural(n, 'задача', 'задачи', 'задач');

  const cheer = () => MASCOT_CHEERS[(doneToday - 1) % MASCOT_CHEERS.length];
  if (doneToday && !leftToday && !overdue) {
    // Кубок — в момент, когда закрыто всё на сегодня; задачи сверх плана снова меняют образ
    if (mascotAllDoneAt !== null && doneToday > mascotAllDoneAt)
      return { pose: cheer().pose, streak, say: `${cheer().say} Сделано за день: ${doneToday}.` };
    mascotAllDoneAt = doneToday;
    if (STREAK_GOALS.includes(streak) || (streak > 365 && streak % 100 === 0))
      return { pose: 'heart', streak, say: `${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд! Горжусь тобой.` };
    return { pose: 'trophy', streak, say: 'Все дела на сегодня закрыты. Чемпион!' };
  }
  mascotAllDoneAt = null;
  if (doneToday) {
    const c = cheer();
    const left = leftToday ? `осталось ${leftToday}` : `просрочено ещё ${overdue}`;
    return { pose: c.pose, streak, say: `${c.say} Сделано ${doneToday}, ${left}.` };
  }
  if (overdue) return { pose: 'shrug', streak,
    say: `Есть просроченные: ${zadach(overdue)}. Давай закроем или перенесём.` };
  if (leftToday) return { pose: 'think', streak,
    say: streak ? `На сегодня ${zadach(leftToday)}. Закрой одну, и серия продолжится.`
                : `На сегодня ${zadach(leftToday)}. Начнём?` };
  return { pose: 'idea', streak,
    say: streak ? 'На сегодня планов нет. Сделай любую задачу, чтобы не прервать серию.'
                : 'На сегодня планов нет. Добавь первую задачу.' };
}

// Образы грузятся заранее, чтобы после галочки Иван сменился сразу, без пустого кадра
let mascotPreloaded = false;
function preloadMascot() {
  if (mascotPreloaded) return;
  mascotPreloaded = true;
  [...MASCOT_CHEERS.map(c => c.pose), 'trophy', 'heart'].forEach(p => { new Image().src = `img/ivan/${p}.webp`; });
}

function renderMascot() {
  preloadMascot();
  const st  = mascotState();
  const img = document.getElementById('mascot-img');
  const src = `img/ivan/${st.pose}.webp`;
  if (img.getAttribute('src') !== src) {
    img.setAttribute('src', src);
    img.classList.remove('pop');
    void img.offsetWidth;
    img.classList.add('pop');
  }
  document.getElementById('mascot-say').textContent = st.say;
  document.getElementById('streak-num').textContent = st.streak;
  document.getElementById('streak-label').textContent = plural(st.streak, 'день', 'дня', 'дней') + ' подряд';
  document.getElementById('streak').classList.toggle('on', st.streak > 0);
}

function renderSideProjects() {
  const box = document.getElementById('side-projects');
  box.innerHTML = '';
  if (!projects.length) box.innerHTML = '<div class="side-empty">Пока нет проектов</div>';
  // Нажатие оставляет в ленте задачи проекта; повторное — возвращает всю ленту
  const item = (key, dot, name) => {
    const n = tasks.filter(t => !t.done && (key === 'none' ? !t.projectId : t.projectId === key)).length;
    const b = document.createElement('button');
    b.className = 'side-proj' + (key === 'none' ? ' none' : '');
    b.setAttribute('aria-pressed', projFilter === key);
    b.innerHTML = `<span class="dot" style="background:${dot}"></span><span class="name">${escHtml(name)}</span><span class="cnt">${n}</span>`;
    b.addEventListener('click', () => setProjFilter(projFilter === key ? null : key));
    box.appendChild(b);
  };
  projects.forEach(p => item(p.id, p.color, p.name));
  item('none', 'transparent', 'Без проекта');
}
function setProjFilter(key) {
  const sel = document.getElementById('task-project');
  // Новая задача из поля сверху попадает в выбранный проект
  if (key && key !== 'none') sel.value = key;
  else if (sel.value === projFilter) sel.value = '';
  projFilter = key;
  if (activeTab !== 'tasks') switchTab('tasks'); else renderAll();
}
function projFilterName() {
  return projFilter === 'none' ? 'Без проекта' : (getProject(projFilter) || {}).name || '';
}

// ═══ RENDER TASKS ═══
function renderTasks() {
  const list  = document.getElementById('tasks-list');
  const dlist = document.getElementById('done-list');
  // Не перерисовываем форму привязки, пока в неё вводят код (realtime и таймер зовут renderAll)
  if (currentUser && !telegramId && document.getElementById('link-card')) return;
  list.innerHTML = ''; dlist.innerHTML = '';

  if (projFilter && projFilter !== 'none' && !getProject(projFilter)) projFilter = null; // проект удалили
  const today     = todayKey();
  const inProj    = t => !projFilter || (projFilter === 'none' ? !t.projectId : t.projectId === projFilter);
  const found     = t => !searchQuery || (t.text + '\n' + (t.note || '')).toLowerCase().includes(searchQuery);
  const base      = t => inProj(t) && found(t);
  const shown     = t => base(t) && (activeFilter==='all' || t.cat===activeFilter) && (!dayFilter || t.dueDate===dayFilter);
  const active    = tasks.filter(t => !t.done && shown(t)).sort(byDue);
  const done      = tasks.filter(t =>  t.done && shown(t));
  const allActive = tasks.filter(t => !t.done);
  const allDone   = tasks.filter(t =>  t.done);
  const total     = allActive.length + allDone.length;

  // Счётчики категорий — с учётом проекта и поиска, чтобы было видно, где искать дальше
  document.getElementById('fc-all').textContent = allActive.filter(base).length;
  ['project','contact','remind','urgent','personal'].forEach(c => {
    const el = document.getElementById('fc-'+c);
    if (el) el.textContent = allActive.filter(t => t.cat===c && base(t)).length;
  });
  document.getElementById('done-count').textContent = allDone.length;

  if (currentUser && !telegramId) {
    list.innerHTML = `<div class="tasks-empty link-card" id="link-card">
      <div class="empty-title">Привяжите Telegram</div>
      <p>Нажмите кнопку и подтвердите вход в окне Telegram — задачи из бота появятся на сайте.</p>
      <div class="auth-error" id="link-error" role="alert"></div>
      <button class="auth-tg" id="btn-link-tg" type="button">${TG_ICON}Привязать через Telegram</button>
      <details class="link-manual">
        <summary>Telegram не открывается? Привязать по коду</summary>
        <p>Отправьте боту команду /link — он пришлёт код из 8 символов. Введите его здесь.</p>
        <div class="link-row">
          <input class="auth-input" id="link-code" type="text" maxlength="8" placeholder="Код из бота" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" aria-label="Код из бота">
          <button class="auth-btn" id="btn-link">Привязать</button>
        </div>
      </details>
    </div>`;
    prefetchTgBotId();
    document.getElementById('btn-link-tg').addEventListener('click', tgLinkClick);
    document.getElementById('btn-link').addEventListener('click', linkTelegram);
    document.getElementById('link-code').addEventListener('keydown', e => { if (e.key==='Enter') linkTelegram(); });
  } else {
    // Полосы выбранного проекта и дня: что сейчас показано и как вернуться ко всей ленте
    const filterBar = (small, title, onBack) => {
      const bar = document.createElement('div');
      bar.className = 'day-filter';
      bar.innerHTML = `<div class="df-text"><small>${small}</small><b>${title}</b></div>
        <button class="btn-sm" type="button">В ленту задач</button>`;
      bar.querySelector('button').addEventListener('click', onBack);
      list.appendChild(bar);
    };
    if (projFilter) {
      const p = getProject(projFilter);
      filterBar('Проект', (p ? `<i class="df-dot" style="background:${p.color}"></i>` : '') + escHtml(projFilterName()), () => setProjFilter(null));
    }
    if (dayFilter) {
      const d = parseDate(dayFilter);
      filterBar(dayFilter === today ? 'Сегодня' : RU_WEEKDAYS[d.getDay()], `${d.getDate()} ${RU_MONTHS_G[d.getMonth()]}`, () => setDayFilter(null));
    }
    const emptyBox = html => {
      const empty = document.createElement('div');
      empty.className = 'tasks-empty';
      empty.innerHTML = html;
      list.appendChild(empty);
    };
    if (total === 0) {
      emptyBox('<img class="empty-ivan" src="img/ivan/idea.webp" width="88" height="120" alt=""><div class="empty-title">Задач пока нет</div><p>Добавьте первую — поле сверху</p>');
    } else if (!active.length && searchQuery) {
      emptyBox(`<div class="empty-title">Ничего не нашлось</div><p>Нет активных задач со словами «${escHtml(searchQuery)}». Esc — очистить поиск</p>`);
    } else if (dayFilter && !active.length) {
      emptyBox(done.length ? '<p>Все задачи этого дня выполнены</p>'
        : '<img class="empty-ivan" src="img/ivan/tongue.webp" width="88" height="120" alt=""><div class="empty-title">Свободный день</div><p>Новая задача из поля сверху попадёт на этот день</p>');
    } else if (!active.length) {
      emptyBox(projFilter ? '<p>В этом проекте нет активных задач</p>' : '<p>Нет активных задач в этой категории</p>');
    } else if (dayFilter) {
      active.forEach(t => list.appendChild(makeTaskEl(t)));
    } else {
      renderFeedGroups(list, active, today);
    }
  }
  if (showDone) done.forEach(t => dlist.appendChild(makeTaskEl(t)));
  if (dayFilter || projFilter || searchQuery) document.getElementById('done-count').textContent = done.length;
  if (searchQuery) [list, dlist].forEach(box => box.querySelectorAll('.task-text, .task-note-preview').forEach(markMatches));
  renderMonthCard();
  renderWeek();
  updateProjectSelect();
}

// Группы ленты по сроку. Группа с data-drop — цель перетаскивания: задача получает её дату
// («На этой неделе» — послезавтра, «Позже» — первый день после этой недели).
// В «Просрочено» и «Не рассортированные» бросить нельзя: дата при постановке обязательна.
// Пустые группы-цели скрыты и появляются, только пока задачу тянут; своя группа задачи целью не считается (style.css).
function renderFeedGroups(list, active, today) {
  const tom      = addDays(today, 1);
  const weekEnd  = addDays(today, (7 - parseDate(today).getDay()) % 7); // воскресенье этой недели
  const weekFrom = addDays(today, 2);
  const laterEnd = weekEnd > tom ? weekEnd : tom;
  const groups = [
    { title: 'Просрочено', cls: 'overdue', has: d => d && d < today },
    { title: 'Не рассортированные', cls: 'inbox', has: d => !d,
      hint: 'Перетащите на день или укажите дату' },
    { title: 'Сегодня',        drop: today,    has: d => d === today },
    { title: 'Завтра',         drop: tom,      has: d => d === tom },
    { title: 'На этой неделе', drop: weekFrom <= weekEnd ? weekFrom : null, has: d => d > tom && d <= weekEnd },
    { title: 'Позже',          drop: addDays(laterEnd, 1), has: d => d > laterEnd },
  ];
  groups.forEach(g => {
    const items = active.filter(t => g.has(t.dueDate));
    if (!items.length && !g.drop) return;
    const sec = document.createElement('section');
    sec.className = 'feed-group' + (items.length ? '' : ' empty');
    sec.setAttribute('aria-label', g.title);
    if (g.drop) sec.dataset.drop = g.drop;
    sec.appendChild(sectionHead(g.title, items.length, g.cls));
    if (g.hint) sec.insertAdjacentHTML('beforeend', `<p class="feed-hint">${g.hint}</p>`);
    if (!items.length) sec.insertAdjacentHTML('beforeend', '<div class="feed-drop-hint">Отпустите, чтобы перенести сюда</div>');
    items.forEach(t => sec.appendChild(makeTaskEl(t)));
    list.appendChild(sec);
  });
}

// Подсветка найденного текста в карточке
function markMatches(el) {
  const text = el.textContent, low = text.toLowerCase();
  let html = '', i = 0, j;
  while ((j = low.indexOf(searchQuery, i)) !== -1) {
    html += escHtml(text.slice(i, j)) + '<mark>' + escHtml(text.slice(j, j + searchQuery.length)) + '</mark>';
    i = j + searchQuery.length;
  }
  if (i) el.innerHTML = html + escHtml(text.slice(i));
}

// ═══ WEEK STRIP ═══
function renderWeek() {
  const strip = document.getElementById('week-strip');
  strip.innerHTML = '';
  const today = todayKey();
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const k = dateKey(d);
    const dayTasks = tasks.filter(t => !t.done && t.dueDate === k).sort(byDue);
    const n = dayTasks.length;
    const shown = dayTasks.slice(0, 2).map(t =>
      `<span class="wd-task">${t.dueTime ? `<b>${fmtTime(t.dueTime)}</b>` : ''}${escHtml(t.text)}</span>`).join('');
    const list = n ? shown + (n > 2 ? `<span class="wd-more">и ещё ${n - 2}</span>` : '')
                   : '<span class="wd-empty">Свободно</span>';
    const b = document.createElement('button');
    b.className = 'week-day' + (k === today ? ' today' : '') + (n ? ' has' : '');
    b.dataset.drop = k;
    if (k === dayFilter) b.setAttribute('aria-pressed', 'true');
    b.setAttribute('aria-label', `${d.getDate()} ${RU_MONTHS_G[d.getMonth()]}, задач: ${n}`);
    b.innerHTML = `<span class="wd-date"><span class="dow">${RU_WD_SHORT[d.getDay()]}</span><span class="num">${d.getDate()}</span></span><span class="wd-list">${list}</span>`;
    b.addEventListener('click', () => setDayFilter(dayFilter === k ? null : k));
    strip.appendChild(b);
  }
}

// ═══ RENDER CALENDAR ═══
function renderCalendar() {
  const m = RU_MONTHS[calMonth];
  document.getElementById('cal-title').innerHTML = `${m.charAt(0).toUpperCase()+m.slice(1)} <span>${calYear}</span>`;

  const dateMap = {};
  tasks.filter(t => !t.done && t.dueDate).forEach(t => {
    if (!dateMap[t.dueDate]) dateMap[t.dueDate] = [];
    dateMap[t.dueDate].push(t);
  });
  Object.values(dateMap).forEach(arr => arr.sort(byDue));

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(d => {
    const el = document.createElement('div'); el.className='cal-dow'; el.textContent=d; grid.appendChild(el);
  });

  const first = new Date(calYear, calMonth, 1);
  const last  = new Date(calYear, calMonth+1, 0);
  let startDow = first.getDay();
  startDow = (startDow + 6) % 7;

  for (let i = 0; i < startDow; i++) {
    const d = new Date(calYear, calMonth, 1 - (startDow - i));
    const k = dateKey(d);
    grid.appendChild(makeDayCell(d.getDate(), k, dateMap[k]||[], true));
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const k = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    grid.appendChild(makeDayCell(d, k, dateMap[k]||[], false));
  }
  const totalCells = startDow + last.getDate();
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    const d = new Date(calYear, calMonth+1, i);
    const k = dateKey(d);
    grid.appendChild(makeDayCell(d.getDate(), k, dateMap[k]||[], true));
  }
  renderCalDay();
}

function makeDayCell(dayNum, key, dayTasks, otherMonth) {
  const today = todayKey();
  const el = document.createElement('button');
  let cls = 'cal-day';
  if (otherMonth)          cls += ' other-month';
  if (key === today)       cls += ' today';
  if (key === calSelected) cls += ' selected';
  el.className = cls;
  el.dataset.drop = key;
  const d = parseDate(key);
  el.setAttribute('aria-label', `${d.getDate()} ${RU_MONTHS_G[d.getMonth()]}${dayTasks.length ? ', задач: ' + dayTasks.length : ''}`);

  const numEl = document.createElement('span');
  numEl.className = 'num';
  numEl.textContent = dayNum;
  el.appendChild(numEl);

  if (dayTasks.length > 0) {
    const isPast = key < today;
    dayTasks.slice(0, 2).forEach(t => {
      const ev = document.createElement('span');
      ev.className = 'cal-ev' + (isPast ? ' overdue' : '');
      ev.dataset.id = t.id;   // событие в клетке можно перетащить на другой день (drag.js)
      ev.textContent = (t.dueTime ? fmtTime(t.dueTime) + ' ' : '') + t.text;
      el.appendChild(ev);
    });
    if (dayTasks.length > 2) {
      const more = document.createElement('span');
      more.className = 'cal-more';
      more.textContent = `+${dayTasks.length - 2}`;
      el.appendChild(more);
    }
    const dots = document.createElement('span');
    dots.className = 'cal-dots';
    for (let i = 0; i < Math.min(dayTasks.length, 3); i++) {
      const dot = document.createElement('span');
      dot.className = 'cal-dot' + (isPast ? ' overdue-dot' : '');
      dots.appendChild(dot);
    }
    el.appendChild(dots);
  }
  el.addEventListener('click', () => { calSelected = calSelected === key ? null : key; renderCalendar(); });
  return el;
}

function renderCalDay() {
  const cont = document.getElementById('cal-day-tasks');
  cont.innerHTML = '';
  const key = calSelected || todayKey();

  const d = parseDate(key);
  const dayTasks  = tasks.filter(t => !t.done && t.dueDate===key).sort(byDue);
  const doneTasks = tasks.filter(t =>  t.done && t.dueDate===key);

  const panel = document.createElement('section');
  panel.className = 'day-panel';
  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:4px">
      <span class="eyebrow">${RU_WEEKDAYS[d.getDay()]}</span>
      <h2 class="day-title">${d.getDate()} ${RU_MONTHS_G[d.getMonth()]}</h2>
    </div>`;
  const listEl = document.createElement('div');
  listEl.className = 'day-list';
  if (dayTasks.length === 0 && doneTasks.length === 0) {
    listEl.innerHTML = '<div class="cal-no-tasks">Задач на этот день нет</div>';
  } else {
    dayTasks.forEach(t => listEl.appendChild(makeTaskEl(t)));
    if (doneTasks.length) {
      listEl.appendChild(sectionHead('Выполненные', doneTasks.length));
      doneTasks.forEach(t => listEl.appendChild(makeTaskEl(t)));
    }
  }
  panel.appendChild(listEl);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-for-day';
  addBtn.innerHTML = `${ICON.plus} Задача на этот день`;
  addBtn.addEventListener('click', () => {
    dayFilter = key; miniAnchor = key;
    document.getElementById('task-due').value = key;
    switchTab('tasks');
    document.getElementById('task-input').focus();
  });
  panel.appendChild(addBtn);
  cont.appendChild(panel);
}

// ═══ RENDER PROJECTS ═══
function renderProjects() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '';

  if (projects.length === 0) {
    list.innerHTML = `<div class="tasks-empty"><img class="empty-ivan" src="img/ivan/think.webp" width="88" height="120" alt=""><div class="empty-title">Нет проектов</div><p>Создайте первый — поле сверху</p></div>`;
  }

  projects.forEach(proj => {
    const projTasks = tasks.filter(t => t.projectId===proj.id && !t.done);
    const card = document.createElement('div');
    card.className = 'proj-card';
    card.innerHTML = `
      <div class="proj-card-header" role="button" tabindex="0" aria-expanded="false">
        <div class="proj-dot" style="background:${proj.color}"></div>
        <div class="proj-name">${escHtml(proj.name)}</div>
        <span class="proj-count">${projTasks.length} активных</span>
        <button class="btn-proj-edit" data-editproj="${proj.id}" aria-label="Переименовать проект" title="Переименовать">${ICON.note}</button>
        <button class="btn-proj-del" data-delproj="${proj.id}" aria-label="Удалить проект">${ICON.close}</button>
        <span class="proj-chevron">${ICON.chev}</span>
      </div>
      <div class="proj-card-body" id="pb-${proj.id}"></div>`;

    const header = card.querySelector('.proj-card-header');
    const toggle = () => {
      card.classList.toggle('open');
      header.setAttribute('aria-expanded', card.classList.contains('open'));
      if (card.classList.contains('open')) renderProjBody(proj.id);
    };
    header.addEventListener('click', e => {
      if (e.target.closest('[data-delproj], [data-editproj], .proj-name-edit')) return;
      toggle();
    });
    card.querySelector('[data-editproj]').addEventListener('click', e => {
      e.stopPropagation();
      const nameEl = card.querySelector('.proj-name');
      if (!nameEl) return; // уже редактируется
      const input = document.createElement('textarea');
      input.className = 'proj-name-edit one-line';
      input.rows = 1;
      input.wrap = 'off';
      input.autocomplete = 'off';
      input.value = proj.name;
      input.maxLength = 60;
      input.setAttribute('aria-label', 'Новое название проекта');
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let finished = false;
      const finish = save => {
        if (finished) return;
        finished = true;
        const name = input.value.trim();
        if (save && name && name !== proj.name) renameProject(proj.id, name).then(() => { renderAll(); updateProjectSelect(); });
        renderAll();
      };
      singleLine(input, () => finish(true));
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
    });
    header.addEventListener('keydown', e => {
      if (e.target !== header) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    card.querySelector('[data-delproj]').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Удалить проект "${proj.name}"? Задачи останутся, но без проекта.`)) return;
      deleteProject(proj.id).then(() => { renderAll(); updateProjectSelect(); });
    });
    list.appendChild(card);
  });

  const unassigned = tasks.filter(t => !t.projectId && !t.done).sort(byDue);
  if (unassigned.length) {
    const sec = document.createElement('div');
    sec.className = 'proj-unassigned';
    sec.innerHTML = `<div class="proj-section-label">Без проекта · ${unassigned.length}</div>`;
    unassigned.forEach(t => sec.appendChild(makeTaskEl(t)));
    list.appendChild(sec);
  }
}

function renderProjBody(projId) {
  const body = document.getElementById('pb-'+projId);
  if (!body) return;
  body.innerHTML = '';
  const projTasks = tasks.filter(t => t.projectId===projId && !t.done).sort(byDue);
  const doneTasks = tasks.filter(t => t.projectId===projId &&  t.done);
  if (!projTasks.length && !doneTasks.length) {
    body.innerHTML = `<div class="proj-empty">Задач в проекте нет</div>`;
    return;
  }
  projTasks.forEach(t => body.appendChild(makeTaskEl(t)));
  if (doneTasks.length) {
    const lbl = document.createElement('div'); lbl.className='proj-section-label'; lbl.style.marginTop='6px'; lbl.textContent=`Выполнено: ${doneTasks.length}`;
    body.appendChild(lbl);
    doneTasks.forEach(t => body.appendChild(makeTaskEl(t)));
  }
}

// ═══ СЕТКА МЕСЯЦА ═══
// Общая для календаря на главной и для выбора даты. Точки под числом — активные задачи дня
// цветом их типа, просроченные — красным.
function activeByDate() {
  const map = {};
  tasks.forEach(t => { if (!t.done && t.dueDate) (map[t.dueDate] = map[t.dueDate] || []).push(t); });
  Object.values(map).forEach(arr => arr.sort(byDue));
  return map;
}
function addDays(key, n) { const d = parseDate(key); d.setDate(d.getDate() + n); return dateKey(d); }
function sameMonth(key, y, m) { const d = key && parseDate(key); return !!d && d.getFullYear() === y && d.getMonth() === m; }
function monthTitle(y, m) { const n = RU_MONTHS[m]; return `${n.charAt(0).toUpperCase() + n.slice(1)} <span>${y}</span>`; }
function monthGridHTML(y, m, { selected, focusKey, curKey, marks, drop }) {
  const today = todayKey();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
  let html = '<div class="mc-dows" aria-hidden="true">' + ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => `<span>${d}</span>`).join('') + '</div><div class="mc-weeks">';
  for (let w = 0; w < weeks; w++) {
    let row = '', cur = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(y, m, 1 - lead + w * 7 + i);
      const k = dateKey(d);
      if (k === curKey) cur = true;
      const list = (marks && marks[k]) || [];
      let cls = 'mc-day';
      if (d.getMonth() !== m) cls += ' other';
      if (i >= 5)             cls += ' weekend';
      if (k === today)        cls += ' today';
      if (k === selected)     cls += ' sel';
      const dots = list.slice(0, 3).map(t =>
        `<i style="--dot:${k < today ? 'var(--c-urgent)' : t.cat ? `var(--c-${t.cat})` : 'var(--accent)'}"></i>`).join('');
      const label = `${d.getDate()} ${RU_MONTHS_G[d.getMonth()]}${k === today ? ', сегодня' : ''}${list.length ? ', задач: ' + list.length : ''}`;
      row += `<button type="button" class="${cls}" data-key="${k}"${drop ? ` data-drop="${k}"` : ''} tabindex="${k === focusKey ? 0 : -1}" aria-label="${label}"${k === selected ? ' aria-pressed="true"' : ''}>${d.getDate()}<span class="mc-dots">${dots}</span></button>`;
    }
    html += `<div class="mc-week${cur ? ' cur' : ''}">${row}</div>`;
  }
  return html + '</div>';
}
// Клавиши в сетке: стрелки — день/неделя, Home/End — начало/конец недели, PageUp/PageDown — месяц
function gridKey(e, key) {
  const d = parseDate(key), dow = (d.getDay() + 6) % 7;
  switch (e.key) {
    case 'ArrowLeft':  return addDays(key, -1);
    case 'ArrowRight': return addDays(key, 1);
    case 'ArrowUp':    return addDays(key, -7);
    case 'ArrowDown':  return addDays(key, 7);
    case 'Home':       return addDays(key, -dow);
    case 'End':        return addDays(key, 6 - dow);
    case 'PageUp':     d.setMonth(d.getMonth() - 1); return dateKey(d);
    case 'PageDown':   d.setMonth(d.getMonth() + 1); return dateKey(d);
  }
  return null;
}

// ═══ КАЛЕНДАРЬ НА ГЛАВНОЙ ═══
// Нажатие на день оставляет в списке только его задачи, и новая задача из поля сверху ставится на этот день
function setDayFilter(key) {
  const due = document.getElementById('task-due');
  if (key) due.value = key;
  else if (due.value === dayFilter) due.value = todayKey(); // дата обязательна: без выбранного дня — сегодня
  dayFilter = key;
  if (key) miniAnchor = key;
  renderTasks();
}
let mcFocus = null;
function renderMonthCard() {
  const a = parseDate(miniAnchor), y = a.getFullYear(), m = a.getMonth();
  document.getElementById('mc-title').innerHTML = monthTitle(y, m);
  const focusKey = [mcFocus, dayFilter, todayKey(), miniAnchor].find(k => sameMonth(k, y, m));
  document.getElementById('mc-grid').innerHTML =
    monthGridHTML(y, m, { selected: dayFilter, focusKey, curKey: miniAnchor, marks: activeByDate(), drop: true });
}
function shiftMini(dir) {
  // На телефоне в свёрнутом виде видна одна неделя — стрелки листают недели, иначе месяцы
  if (matchMedia('(max-width: 860px)').matches && !miniExpanded) miniAnchor = addDays(miniAnchor, 7 * dir);
  else { const a = parseDate(miniAnchor); miniAnchor = dateKey(new Date(a.getFullYear(), a.getMonth() + dir, 1)); }
  mcFocus = null;
  renderMonthCard();
}
document.getElementById('mc-prev').innerHTML = ICON.chev;
document.getElementById('mc-next').innerHTML = ICON.chev;
document.getElementById('mc-prev').addEventListener('click', () => shiftMini(-1));
document.getElementById('mc-next').addEventListener('click', () => shiftMini(1));
document.getElementById('mc-toggle').addEventListener('click', e => {
  miniExpanded = !miniExpanded;
  document.getElementById('month-card').classList.toggle('expanded', miniExpanded);
  e.currentTarget.textContent = miniExpanded ? 'Неделя' : 'Месяц';
  e.currentTarget.setAttribute('aria-expanded', miniExpanded);
});
document.getElementById('mc-grid').addEventListener('click', e => {
  const b = e.target.closest('.mc-day');
  if (b) setDayFilter(dayFilter === b.dataset.key ? null : b.dataset.key);
});
document.getElementById('mc-grid').addEventListener('keydown', e => {
  const b = e.target.closest('.mc-day');
  const next = b && gridKey(e, b.dataset.key);
  if (!next) return;
  e.preventDefault();
  mcFocus = next; miniAnchor = next;
  renderMonthCard();
  document.querySelector(`#mc-grid [data-key="${next}"]`).focus();
});

// Перетаскивание задач на день — в drag.js

