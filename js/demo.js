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

  // Список пользователей в демо — выдуманные люди
  loadAdminUsers = async () => {
    const ago = (d, h = 10) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 15, 0, 0); return x.toISOString(); };
    return { data: [
      { id: 'd1', name: 'Анна Смирнова', email: 'anna@example.ru', tg_username: 'anna_sm', tg: true, confirmed: true, created_at: ago(0, 9), last_sign_in_at: ago(0, 14), tasks: 12, tasks_open: 4 },
      { id: 'd2', name: 'Пётр Иванов', email: null, tg_username: 'petr_iv', tg: true, confirmed: true, created_at: ago(1), last_sign_in_at: ago(1, 18), tasks: 5, tasks_open: 2 },
      { id: 'd3', name: null, email: 'student@example.ru', tg_username: null, tg: false, confirmed: false, created_at: ago(3), last_sign_in_at: null, tasks: 0, tasks_open: 0 },
      { id: 'd4', name: 'Мария Котова', email: 'kotova@example.ru', tg_username: null, tg: true, confirmed: true, created_at: ago(9), last_sign_in_at: ago(2, 8), tasks: 41, tasks_open: 7 },
      { id: 'd5', name: 'Олег', email: 'oleg@example.ru', tg_username: 'oleg_k', tg: true, confirmed: true, blocked: true, created_at: ago(20), last_sign_in_at: ago(15), tasks: 3, tasks_open: 3 },
    ] };
  };

  // Здоровье системы в демо — всё в порядке, одно предупреждение
  const minsAgo = m => new Date(Date.now() - m * 60000).toISOString();
  loadAdminHealth = async () => ({ data: {
    now: new Date().toISOString(),
    jobs: [
      { name: 'cleanup-cron-history', active: true, last_at: minsAgo(600), last_ok: true, runs_day: 1, fails_day: 0 },
      { name: 'cleanup-link-codes', active: true, last_at: minsAgo(620), last_ok: true, runs_day: 1, fails_day: 0 },
      { name: 'keep-bot-awake', active: true, last_at: minsAgo(4), last_ok: true, runs_day: 144, fails_day: 0 },
      { name: 'morning-summary', active: true, last_at: minsAgo(0.5), last_ok: true, runs_day: 1440, fails_day: 0 },
      { name: 'task-reminders', active: true, last_at: minsAgo(0.5), last_ok: true, runs_day: 1440, fails_day: 2 },
      { name: 'weekly-backup', active: true, last_at: minsAgo(3 * 1440), last_ok: true, runs_day: 0, fails_day: 0 },
    ],
    reminders: { sent_day: 37, stuck: 0, token: true },
    morning: { enabled: 88, sent_today: 41, sent_week: 236 },
    requests: { total: 412, failed: 3, since: minsAgo(360), reasons: [{ reason: 'Forbidden: bot was blocked by the user', n: 3 }] },
    storage: { db_bytes: 31 * 1024 * 1024, buckets: [{ bucket: 'avatars', files: 23, bytes: 1.4 * 1024 * 1024 }, { bucket: 'task-files', files: 64, bytes: 118 * 1024 * 1024 }] },
  } });
  pingBot = async () => ({ ok: true, ms: 420, code: 200 });

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
