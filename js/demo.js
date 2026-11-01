// ═══ ДЕМО-РЕЖИМ (?demo) ═══
// Открывает планнер без входа на примерных данных — для портфолио и показа клиентам.
// Ничего не читает и не пишет ни в Supabase, ни в localStorage.
if (new URLSearchParams(location.search).has('demo')) {
  const off = n => { const d = new Date(); d.setDate(d.getDate() + n); return dateKey(d); };
  // Выполнено n дней назад — чтобы в демо у Ивана была серия дней
  const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getTime(); };
  const demoProjects = [
    { id: 'demo-p1', name: 'Ребрендинг кофейни', color: '#8b78f0', created: Date.now() },
    { id: 'demo-p2', name: 'Сайт студии',        color: '#5ba8f0', created: Date.now() },
    { id: 'demo-p3', name: 'Здоровье',           color: '#5fcea0', created: Date.now() },
  ];
  const T = (text, cat, due, time, projectId, extra) => ({
    id: uid(), text, cat, note: '', done: false, created: Date.now(), dueDate: due, dueTime: time,
    projectId, recur: null, subtasks: [], files: [], doneAt: null, ...extra,
  });
  // Файлы демо живут только в памяти страницы: id файла → Blob
  const demoBlobs = {};
  const demoFile = (name, text) => {
    const id = uid(), blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    demoBlobs[id] = blob;
    return { id, name, path: 'demo/' + id, size: blob.size, type: blob.type };
  };
  const demoTasks = () => [
    T('Отправить коммерческое предложение', 'contact',  off(-1), null,       'demo-p1'),
    T('Утвердить макет главной страницы',   'project',  off(0),  '11:00:00', 'demo-p2', { note: 'Проверить мобильную версию и цвета кнопок',
      files: [demoFile('ТЗ на главную страницу.txt', 'Главная страница студии\n\n1. Шапка и меню\n2. Карточки услуг\n3. Форма заявки\n')],
      subtasks: [{ id: 's1', text: 'Шапка и меню', done: true }, { id: 's2', text: 'Карточки услуг', done: false }, { id: 's3', text: 'Форма заявки', done: false }] }),
    T('Созвон с подрядчиком по сайту',      'contact',  off(0),  '14:30:00', 'demo-p2'),
    T('Оплатить хостинг',                   'remind',   off(0),  null,       null,      { recur: 'monthly' }),
    T('Пробежка 5 км',                      'personal', off(1),  '07:30:00', 'demo-p3', { recur: 'days:2' }),
    T('Планёрка с командой',                'project',  off(1),  '10:00:00', 'demo-p2', { recur: 'weekdays' }),
    T('Подготовить отчёт за квартал',       'urgent',   off(3),  null,       null),
    T('Собрать референсы для логотипа',     'project',  off(5),  null,       'demo-p1'),
    T('Записаться к стоматологу',           'personal', off(12), null,       'demo-p3'),
    // Пришли из Telegram-бота без даты — попадают в «Не рассортированные»
    T('Посмотреть вебинар по UX',           null,       null,    null,       null,      { note: 'Ссылка в переписке с куратором' }),
    T('Скинуть Ане фото для презентации',   'contact',  null,    null,       'demo-p1'),
    T('Проверить почту от куратора',        'remind',   off(0),  null,       null,      { done: true, doneAt: Date.now() }),
    T('Ответить на письмо клиента',         'contact',  off(-1), null,       null,      { done: true, doneAt: ago(1) }),
    T('Обновить портфолио',                 'personal', off(-2), null,       null,      { done: true, doneAt: ago(2) }),
    T('Купить продукты на неделю',          'personal', off(-3), null,       null,      { done: true, doneAt: ago(3) }),
  ];

  // Вход и база не нужны: все операции работают только в памяти страницы
  showAuthOverlay   = () => {};
  subscribeRealtime = () => {};
  loadProjects      = async () => {};
  addProject        = async (name, color) => { projects.push({ id: uid(), name, color, created: Date.now() }); };
  renameProject     = async (id, name) => { const p = getProject(id); if (p) p.name = name; };
  deleteProject     = async id => {
    projects = projects.filter(p => p.id !== id);
    tasks.forEach(t => { if (t.projectId === id) t.projectId = null; });
  };
  loadTasks = async () => {
    setSyncStatus('ok');
    document.getElementById('sync-label').textContent = 'Демо-режим';
  };
  addTask = async (text, cat, due, dueTime, projId, recur) => {
    tasks.unshift(T(text, cat || null, due || null, dueTime ? dueTime + ':00' : null, projId || null, { recur: recur || null }));
    return true;
  };
  toggleDone = async id => {
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    t.done = !t.done; t.doneAt = t.done ? Date.now() : null;
    if (!t.recur) return;
    const copy = nextCopyOf(t);
    if (t.done && !copy) tasks.unshift(T(t.text, t.cat, nextDue(t.dueDate, t.recur), t.dueTime, t.projectId,
      { recur: t.recur, note: t.note, subtasks: t.subtasks.map(x => ({ ...x, done: false })), files: t.files }));
    else if (!t.done && copy) tasks = tasks.filter(x => x.id !== copy.id);
  };
  // Удалённая задача возвращается «Отменить» как есть: в демо «строка базы» — сама задача
  deleteTask  = async id => { const t = tasks.find(t => t.id === id); tasks = tasks.filter(t => t.id !== id); return t || null; };
  restoreTask = async t => { if (!tasks.some(x => x.id === t.id)) tasks.unshift(t); return true; };
  saveTask    = async (id, f) => {
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    const map = { text: 'text', cat: 'cat', note: 'note', due_date: 'dueDate', due_time: 'dueTime',
                  project_id: 'projectId', recur: 'recur', subtasks: 'subtasks' };
    for (const k in f) if (map[k]) t[map[k]] = f[k];
  };
  uploadTaskFile = async (taskId, file) => {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return 'задача не найдена';
    if (t.files.length >= FILES_MAX) return `к задаче можно прикрепить не больше ${FILES_MAX} файлов`;
    if (file.size > FILE_MAX_BYTES) return `«${file.name}» больше ${fmtSize(FILE_MAX_BYTES)}`;
    const id = uid();
    demoBlobs[id] = file;
    t.files = [...t.files, { id, name: file.name, path: 'demo/' + id, size: file.size, type: file.type || '' }];
    return null;
  };
  removeTaskFile = async (taskId, fileId) => {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return false;
    t.files = t.files.filter(f => f.id !== fileId);
    return true;
  };
  purgeFiles = async () => {};
  fileBlob   = async f => { const b = demoBlobs[f.id]; if (!b) throw new Error('файла нет'); return b; };
  moveTask   = async (id, due) => { const t = tasks.find(t => t.id === id); if (t) t.dueDate = due; };
  importBackup = async (projRows, taskRows) => {
    const fresh = (list, rows) => rows.filter(r => !list.some(x => x.id === r.id));
    const p = fresh(projects, projRows), t = fresh(tasks, taskRows);
    projects.push(...p.map(projFromDB));
    tasks.unshift(...t.map(fromDB));
    return { projects: p.length, tasks: t.length };
  };

  // Статистика админа в демо — примерные числа
  loadAdminStats = async () => ({ data: {
    users_total: 128, users_day: 3, users_week: 17, tg_linked: 94, active_week: 61,
    tasks_total: 2140, tasks_open: 486, created_day: 52, created_week: 340, done_day: 41, done_week: 297,
    days: Array.from({ length: 14 }, (_, i) => ({ day: off(i - 13), created: 30 + (i * 7) % 25, done: 22 + (i * 5) % 23 })),
  } });

  hideAuthOverlay();
  avatarDemo.on = true; renderAvatar();
  initTheme();
  updateHeader();
  setInterval(updateHeader, 60000);
  projects = demoProjects.map(p => ({ ...p }));
  tasks = demoTasks();
  initColorPicker();
  updateProjectSelect();
  loadTasks();
  renderAll();
}
