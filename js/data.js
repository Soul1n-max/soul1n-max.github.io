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
  // Задачи хранятся по Telegram ID (так их видит и бот), без привязки база их не примет
  if (!telegramId) {
    showLinkCard();
    announce('Сначала привяжите Telegram — задача сохранится после привязки.');
    if (document.getElementById('link-error')) showAuthError('link-error', 'Чтобы сохранить задачу, сначала привяжите Telegram — так задачи появятся и в боте.');
    return false;
  }
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

// Следующая невыполненная копия повторяющейся задачи, если она уже есть
function nextCopyOf(t) {
  const nd = nextDue(t.dueDate, t.recur);
  return tasks.find(x => x.id !== t.id && !x.done && x.recur === t.recur && x.text === t.text
    && x.dueDate === nd && (x.projectId || null) === (t.projectId || null)) || null;
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
  if (!t.recur) return;
  const copy = nextCopyOf(t);
  if (newDone && !copy) {
    const row = {
      id: uid(), text: t.text, cat: t.cat, note: t.note || '', done: false,
      due_date: nextDue(t.dueDate, t.recur), due_time: t.dueTime || null,
      project_id: t.projectId || null, recur: t.recur,
      user_id: telegramId || null,
    };
    // Подзадачи переходят в следующий повтор неотмеченными
    if (t.subtasks.length) row.subtasks = t.subtasks.map(x => ({ ...x, done: false }));
    const { data, error: insErr } = await sb.from('tasks').insert([row]).select().single();
    if (insErr) { console.error('Recur insert:', insErr); alert('Задача выполнена, но следующий повтор не создался: ' + insErr.message); return; }
    tasks.unshift(fromDB(data));
  } else if (!newDone && copy) {
    // Отметку сняли — убираем копию, созданную при выполнении, чтобы повтор не задвоился
    const { error: delErr } = await sb.from('tasks').delete().eq('id', copy.id);
    if (delErr) { console.error('Recur delete:', delErr); return; }
    tasks = tasks.filter(x => x.id !== copy.id);
  }
}

// Возвращает удалённую строку целиком — по ней restoreTask() вернёт задачу кнопкой «Отменить»
async function deleteTask(id) {
  const { data, error } = await sb.from('tasks').delete().eq('id', id).select();
  if (error) { console.error('Delete:', error); alert('Не удалось удалить задачу: ' + error.message); return null; }
  tasks = tasks.filter(t => t.id !== id);
  return (data && data[0]) || null;
}
// Та же строка с тем же id, датой создания и отметкой о напоминании — задача возвращается как была
async function restoreTask(row) {
  const { data, error } = await sb.from('tasks').insert([row]).select().single();
  if (error) { console.error('Restore:', error); alert('Не удалось вернуть задачу: ' + error.message); return false; }
  if (!tasks.some(t => t.id === data.id)) tasks.unshift(fromDB(data));
  return true;
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


// ═══ BACKUP ═══
// Загрузка копии: строки уже проверены (backupRows в ui.js), владелец — текущий пользователь.
// Задачи и проекты, которые уже есть в базе (тот же id), не меняются. Возвращает, сколько добавлено.
async function importBackup(projRows, taskRows) {
  const put = async (table, rows) => {
    let added = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500).map(r => ({ ...r, user_id: telegramId }));
      const { data, error } = await sb.from(table).upsert(part, { onConflict: 'id', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      added += (data || []).length;
    }
    return added;
  };
  try {
    const p = await put('projects', projRows);
    const t = await put('tasks', taskRows);
    return { projects: p, tasks: t };
  } catch (error) {
    console.error('Backup import:', error);
    alert('Не удалось загрузить копию: ' + error.message);
    return null;
  }
}
