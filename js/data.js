// Данные: проекты и задачи в Supabase

// ═══ PROJECTS (Supabase) ═══
// Цвет проекта попадает в style="…", поэтому пропускаем только вид #RRGGBB
function safeColor(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : PROJ_COLORS[0]; }
function projFromDB(row) {
  return {
    id:      row.id,
    name:    row.name,
    color:   safeColor(row.color),
    created: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}
function localProjects() {
  try { return JSON.parse(localStorage.getItem('spm2_projects') || '[]'); } catch { return []; }
}
// Проекты, созданные до переноса в базу, лежат в localStorage этого браузера.
// Переносим их один раз с теми же id, чтобы задачи не потеряли свой проект.
// Старый список остаётся в spm2_projects_backup на всякий случай.
async function migrateLocalProjects() {
  const local = localProjects().filter(p => p && p.id && p.name);
  if (!local.length) return true;
  const isUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const rows = local.map(p => ({
    id:         isUuid(p.id) ? p.id : uid(),
    user_id:    telegramId,
    name:       String(p.name).slice(0, 60),
    color:      safeColor(p.color),
    created_at: new Date(p.created || Date.now()).toISOString(),
  }));
  const { error } = await sb.from('projects').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) { console.error('Projects migrate:', error); return false; }
  try {
    localStorage.setItem('spm2_projects_backup', localStorage.getItem('spm2_projects'));
    localStorage.removeItem('spm2_projects');
  } catch {}
  return true;
}
async function loadProjects() {
  if (!telegramId) { projects = []; return; }
  await migrateLocalProjects();
  const { data, error } = await sb.from('projects').select('*')
    .eq('user_id', telegramId).order('created_at', { ascending: true });
  if (error) {
    // Таблицы ещё нет или нет связи — показываем проекты из этого браузера
    console.error('Projects load:', error);
    projects = localProjects();
    setSyncStatus('err');
    document.getElementById('sync-label').textContent = 'Проекты: ' + (error.message || 'ошибка');
    return;
  }
  projects = (data || []).map(projFromDB);
}

// ═══ TASKS (Supabase) ═══
async function loadTasks() {
  if (!telegramId) {
    tasks = [];
    setSyncStatus('ok');
    return;
  }
  setSyncStatus('loading');
  try {
    let q = sb.from('tasks').select('*').order('created_at', { ascending: false });
    q = q.eq('user_id', telegramId);
    const { data, error } = await q;
    if (error) {
      console.error('Supabase error:', error);
      setSyncStatus('err');
      document.getElementById('sync-label').textContent = error.message || 'Ошибка';
      return;
    }
    tasks = (data || []).map(fromDB);
    setSyncStatus('ok');
  } catch(e) {
    console.error('Network error:', e);
    setSyncStatus('err');
    document.getElementById('sync-label').textContent = e.message || 'Нет сети';
  }
}

async function addTask(text, cat, due, dueTime, projId, recur) {
  const row = {
    id:         uid(),
    text,
    cat:        cat || null,
    note:       '',
    done:       false,
    due_date:   due || null,
    due_time:   dueTime ? dueTime + ':00' : null,
    project_id: projId || null,
    recur:      recur || null,
    user_id:    telegramId || null,
  };
  const { data, error } = await sb.from('tasks').insert([row]).select().single();
  if (error) { console.error('Insert:', error); alert('Не удалось добавить задачу: ' + error.message); return false; }
  tasks.unshift(fromDB(data));
  return true;
}

async function toggleDone(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  const newDone = !t.done;
  const doneAt = newDone ? new Date().toISOString() : null;
  const { error } = await sb.from('tasks').update({ done: newDone, done_at: doneAt }).eq('id', id);
  if (error) { console.error('Update:', error); alert('Не удалось сохранить: ' + error.message); return; }
  t.done = newDone;
  t.doneAt = newDone ? Date.now() : null;
  if (newDone && t.recur) {
    const nd = nextDue(t.dueDate, t.recur);
    const row = {
      id: uid(), text: t.text, cat: t.cat, note: t.note || '', done: false,
      due_date: nd, due_time: t.dueTime || null,
      project_id: t.projectId || null, recur: t.recur,
      user_id: telegramId || null,
    };
    const { data } = await sb.from('tasks').insert([row]).select().single();
    if (data) tasks.unshift(fromDB(data));
  }
}

async function deleteTask(id) {
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) { console.error('Delete:', error); alert('Не удалось удалить задачу: ' + error.message); return; }
  tasks = tasks.filter(t => t.id !== id);
}

async function saveTask(id, fields) {
  const { data, error } = await sb.from('tasks').update(fields).eq('id', id).select().single();
  if (error) { console.error('Task update:', error); alert('Не удалось сохранить задачу: ' + error.message); return; }
  const i = tasks.findIndex(t => t.id === id);
  if (i >= 0) tasks[i] = fromDB(data);
}

// Перенос задачи на другой день (перетаскиванием на календарь)
async function moveTask(id, dueDate) {
  const { data, error } = await sb.from('tasks').update({ due_date: dueDate }).eq('id', id).select().single();
  if (error) { console.error('Task move:', error); alert('Не удалось перенести задачу: ' + error.message); return; }
  const i = tasks.findIndex(t => t.id === id);
  if (i >= 0) tasks[i] = fromDB(data);
}

// ═══ PROJECT OPS ═══
async function addProject(name, color) {
  const row = { id: uid(), user_id: telegramId, name, color };
  const { data, error } = await sb.from('projects').insert([row]).select().single();
  if (error) { console.error('Project insert:', error); alert('Не удалось создать проект: ' + error.message); return; }
  projects.push(projFromDB(data));
}
async function renameProject(id, name) {
  const p = getProject(id);
  if (!p) return;
  const { error } = await sb.from('projects').update({ name }).eq('id', id);
  if (error) { console.error('Project rename:', error); alert('Не удалось переименовать проект: ' + error.message); return; }
  p.name = name;
}
async function deleteProject(id) {
  // Задачи остаются, но без проекта
  const { error: tErr } = await sb.from('tasks').update({ project_id: null }).eq('project_id', id);
  if (tErr) { console.error('Project unlink tasks:', tErr); alert('Не удалось удалить проект: ' + tErr.message); return; }
  const { data, error } = await sb.from('projects').delete().eq('id', id).select('id');
  if (error) { console.error('Project delete:', error); alert('Не удалось удалить проект: ' + error.message); return; }
  if (!data || !data.length) { alert('Не удалось удалить проект: в базе его нет или нет доступа'); return; }
  projects = projects.filter(p => p.id !== id);
  tasks.forEach(t => { if (t.projectId === id) t.projectId = null; });
}

