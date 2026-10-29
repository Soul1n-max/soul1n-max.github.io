// Запуск приложения

// ═══ INIT ═══
async function init() {
  initTheme();
  updateHeader();
  setInterval(updateHeader, 60000);
  initColorPicker();
  updateProjectSelect();
  renderMeta();

  await initAuth();
  const tgRedirectUser = takeTgAuthRedirect();
  if (passwordRecovery) return; // ждём новый пароль, задачи загрузит onAuthStateChange
  if (!currentUser) {
    // Открыли во встроенном браузере Telegram — сразу перекидываем в браузер телефона, один раз за вкладку
    if (inTelegramBrowser()) {
      let tried = true;
      try { tried = !!sessionStorage.getItem('spm2_ext_tried'); sessionStorage.setItem('spm2_ext_tried', '1'); } catch (_) {}
      if (!tried) openInPhoneBrowser();
    }
    // Вернулись со страницы входа Telegram — входим; задачи загрузит onAuthStateChange
    if (tgRedirectUser) finishTelegramLogin(tgRedirectUser, 'auth-error-login');
    return; // ждём логина
  }

  document.getElementById('tasks-list').innerHTML =
    '<div class="tasks-empty"><p>Загрузка задач из базы данных…</p></div>';

  await loadProjects();
  updateProjectSelect();
  await loadTasks();

  renderAll();
  subscribeRealtime();
  // Вернулись со страницы Telegram после «Привязать через Telegram»
  if (tgRedirectUser && !telegramId) linkWithTelegramUser(tgRedirectUser);
}

let rtStarted = false;
let rtConnected = false;
let rtWasConnected = false;
function subscribeRealtime() {
  if (rtStarted) return;
  rtStarted = true;
  const refresh = async () => {
    if (!currentUser) return;
    await loadProjects();
    updateProjectSelect();
    await loadTasks();
    renderAll();
  };
  const refreshProjects = async () => {
    if (!currentUser) return;
    await loadProjects();
    updateProjectSelect();
    renderAll();
  };
  // Real-time subscription — обновляет планнер когда бот добавляет задачи или проекты меняются на другом устройстве
  sb.channel('tasks-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, refreshProjects)
    .subscribe(status => {
      const reconnected = status === 'SUBSCRIBED' && !rtConnected && rtWasConnected;
      rtConnected = status === 'SUBSCRIBED';
      if (rtConnected) rtWasConnected = true;
      // После переподключения догружаем то, что могло прийти, пока канал был закрыт
      if (reconnected) refresh();
    });

  // Резервное обновление раз в минуту — только если Realtime отвалился и вкладка открыта
  setInterval(() => {
    if (!rtConnected && !document.hidden) refresh();
  }, 60000);

  // Вернулись на вкладку — обновляем: пока она была скрыта, события могли потеряться
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
}

// В демо-режиме вход и загрузка из базы не запускаются: страницу поднимает js/demo.js
if (!new URLSearchParams(location.search).has('demo')) init();
