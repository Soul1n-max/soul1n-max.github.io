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
    projectId, recur: null, doneAt: null, ...extra,
  });
  const demoTasks = () => [
    T('Отправить коммерческое предложение', 'contact',  off(-1), null,       'demo-p1'),
    T('Утвердить макет главной страницы',   'project',  off(0),  '11:00:00', 'demo-p2', { note: 'Проверить мобильную версию и цвета кнопок' }),
    T('Созвон с подрядчиком по сайту',      'contact',  off(0),  '14:30:00', 'demo-p2'),
    T('Оплатить хостинг',                   'remind',   off(0),  null,       null,      { recur: 'monthly' }),
    T('Пробежка 5 км',                      'personal', off(1),  '07:30:00', 'demo-p3', { recur: 'daily' }),
    T('Подготовить отчёт за квартал',       'urgent',   off(3),  null,       null),
    T('Собрать референсы для логотипа',     'project',  off(5),  null,       'demo-p1'),
    T('Ответить на письмо клиента',         'contact',  off(-1), null,       null,      { done: true, doneAt: ago(1) }),
    T('Обновить портфолио',                 'personal', off(-2), null,       null,      { done: true, doneAt: ago(2) }),
    T('Купить продукты на неделю',          'personal', off(-3), null,       null,      { done: true, doneAt: ago(3) }),
  ];

  // Вход и база не нужны: все операции работают только в памяти страницы
  showAuthOverlay   = () => {};
  subscribeRealtime = () => {};
  loadProjects      = async () => { projects = demoProjects.map(p => ({ ...p })); };
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
    if (t) { t.done = !t.done; t.doneAt = t.done ? Date.now() : null; }
  };
  deleteTask = async id => { tasks = tasks.filter(t => t.id !== id); };
  saveTask   = async (id, f) => {
    const t = tasks.find(t => t.id === id);
    if (t) Object.assign(t, { text: f.text, cat: f.cat, note: f.note, dueDate: f.due_date,
      dueTime: f.due_time, projectId: f.project_id, recur: f.recur });
  };
  moveTask   = async (id, due) => { const t = tasks.find(t => t.id === id); if (t) t.dueDate = due; };

  hideAuthOverlay();
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
