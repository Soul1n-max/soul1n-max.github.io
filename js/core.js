// Основа: подключение к Supabase, иконки, константы, состояние, общие функции

// ═══ SUPABASE ═══
const SUPABASE_URL = 'https://goaccwjzmraditwfaeni.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BCqoxTR0oUH_wX-Xt_SSCA_WzLkk4tU';
// Ссылка из письма «Сбросить пароль» возвращает на сайт с #…type=recovery, а устаревшая —
// с #…error_code=…. Смотрим адрес до createClient: клиент сам разбирает его и стирает.
let passwordRecovery = /[#&]type=recovery(&|$)/.test(location.hash);
const authLinkError = /[#&]error_code=/.test(location.hash);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// Сервер Telegram-бота на Render: проверяет вход через Telegram и выдаёт токен входа
const TG_LOGIN_URL = 'https://synergia-planner-1.onrender.com/site-login';
const TG_LINK_URL  = 'https://synergia-planner-1.onrender.com/site-link';
const TG_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 4.5L2.5 11.8l6 2.2M21.5 4.5l-3 15-7-5.3M21.5 4.5L8.5 14l3 5.5 2-5.3"/></svg>';

// ═══ ICONS ═══
const ICON = {
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  note:  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  sun:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  plus:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  down:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  up:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>',
  list:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l1.5 1.5L8 5M4 13l1.5 1.5L8 12M11 6h9M11 13h9M11 19h9M5 19h1"/></svg>',
  clip:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.5l-8.4 8.4a5 5 0 0 1-7.1-7.1l8.8-8.8a3.3 3.3 0 0 1 4.7 4.7l-8.8 8.8a1.7 1.7 0 0 1-2.4-2.4l8.1-8.1"/></svg>',
  file:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  exit:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>',
  table: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 10v10"/></svg>',
};

// ═══ AUTH STATE ═══
let currentUser = null;
let telegramId = null;

// Привязка хранится в app_metadata: её ставит только функция link_telegram в базе
// по коду от бота. user_metadata пользователь может менять сам, поэтому ему не верим.
function tgIdOf(user) {
  const id = user?.app_metadata?.telegram_id;
  return id ? parseInt(id) : null;
}

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (authLinkError) {
    history.replaceState(null, '', location.pathname + location.search);
    showAuthError('auth-error-login', 'Ссылка из письма устарела или уже использована. Запросите новую.');
  }
  if (passwordRecovery && !session?.user) passwordRecovery = false;
  if (passwordRecovery) {
    // Пришли по ссылке сброса: сессия уже есть, но планнер откроем после нового пароля
    showAuthOverlay(); showResetForm(null);
  } else if (session?.user) {
    currentUser = session.user;
    telegramId = tgIdOf(currentUser);
    document.getElementById('btn-logout').style.display = '';
    hideAuthOverlay();
  } else {
    showAuthOverlay();
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') passwordRecovery = true;
    // Пока задаётся новый пароль, планнер закрыт; вход завершит USER_UPDATED после смены пароля
    if (passwordRecovery && session?.user) return;
    const wasLoggedIn = !!currentUser;
    currentUser = session?.user || null;
    telegramId = tgIdOf(currentUser);
    if (currentUser) {
      document.getElementById('btn-logout').style.display = '';
      hideAuthOverlay();
      if (!wasLoggedIn) {
        // Пользователь только что вошёл — загружаем задачи
        document.getElementById('tasks-list').innerHTML =
          '<div class="tasks-empty"><p>Загрузка задач…</p></div>';
        initColorPicker();
        await loadProjects(); updateProjectSelect();
        await loadTasks(); renderAll();
        subscribeRealtime();
      }
    } else {
      document.getElementById('btn-logout').style.display = 'none';
      showAuthOverlay();
    }
  });
}
function showAuthOverlay() {
  document.body.classList.add('auth-locked');
  document.getElementById('auth-overlay').style.display = 'flex';
  prefetchTgBotId();
}
function hideAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.body.classList.remove('auth-locked');
  clearAuthInputs();
}
// Пароль, оставшийся в скрытой форме входа, браузер принимал за вход при добавлении
// задачи и предлагал «сохранить пароль» с текстом задачи вместо почты.
// Формы входа обёрнуты в <form>: без них Chrome считал поле задачи полем логина
// и подставлял туда сохранённый email.
// Ни одна форма на странице никуда не отправляется: всё делают кнопки через JS.
// Вместо onsubmit="return false" в разметке — встроенные обработчики запрещены CSP.
document.addEventListener('submit', e => e.preventDefault());
// Название задачи и проекта вводятся в <textarea> в одну строку, а не в <input>:
// менеджеры паролей (Chrome, Яндекс, Edge) подставляют сохранённые почту и пароль
// только в <input> и не слушают autocomplete="off". Enter не переносит строку,
// а вызывает onEnter; переносы из вставленного текста заменяются пробелами.
function singleLine(el, onEnter) {
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (onEnter) onEnter();
  });
  el.addEventListener('input', () => {
    if (/[\r\n]/.test(el.value)) el.value = el.value.replace(/[\r\n]+/g, ' ');
  });
}
function clearAuthInputs() {
  document.querySelectorAll('#auth-overlay input').forEach(i => { i.value = ''; });
}
function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.add('visible');
}
function clearAuthError(id) {
  const el = document.getElementById(id);
  el.textContent = ''; el.classList.remove('visible');
}
function switchAuthForm(show) {
  document.getElementById('auth-form-login').style.display    = show==='login'    ? '' : 'none';
  document.getElementById('auth-form-register').style.display = show==='register' ? '' : 'none';
  document.getElementById('auth-form-confirm').style.display  = show==='confirm'  ? '' : 'none';
  document.getElementById('auth-form-forgot').style.display   = show==='forgot'   ? '' : 'none';
  document.getElementById('auth-form-reset').style.display    = show==='reset'    ? '' : 'none';
}

// ═══ CONSTANTS ═══
const CATS = {
  project:  {label:'Проект',    cls:'cat-project'},
  contact:  {label:'Контакт',   cls:'cat-contact'},
  remind:   {label:'Напомнить', cls:'cat-remind'},
  urgent:   {label:'Срочно',    cls:'cat-urgent'},
  personal: {label:'Личное',    cls:'cat-personal'},
};
const PROJ_COLORS = ['#8b78f0','#5ba8f0','#5fcea0','#f0976a','#e06a72','#f5c842','#c45bde','#42d4d4'];
// Повторы. В поле recur — одно из слов ниже или «days:N», «weeks:N», «months:N» (раз в N дней, недель, месяцев)
const RECUR_LABELS = {daily:'Ежедневно',weekdays:'По будням',weekly:'Еженедельно',monthly:'Ежемесячно',yearly:'Ежегодно'};
// Что предлагают списки «Повтор»; другой интервал задаётся фразой («каждые 5 дней»)
const RECUR_CHOICES = ['daily','weekdays','days:2','weekly','weeks:2','monthly','yearly'];
const RECUR_RE = /^(daily|weekdays|weekly|monthly|yearly|(days|weeks|months):([1-9]\d{0,2}))$/;
function isRecur(r) { return typeof r === 'string' && RECUR_RE.test(r) && !/:1$/.test(r) && !(+r.split(':')[1] > 365); }
const RU_MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const RU_MONTHS_G = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const RU_WEEKDAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const RU_WD_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

// ═══ STATE ═══
let tasks = [];
let projects = [];
let selectedCat = null;
let activeFilter = 'all';
let showDone = false;
let activeTab = 'tasks';
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelected = null;
let dayFilter = null;     // день, выбранный в календаре на главной: список задач показывает только его
let projFilter = null;    // проект, выбранный в боковом меню: id проекта или 'none' — «Без проекта»
let searchQuery = '';     // текст из поиска над лентой, в нижнем регистре
let miniAnchor = todayKey(); // какой месяц (и на телефоне — какую неделю) показывает календарь на главной
let miniExpanded = false;
// Перетаскивание задач на день (drag.js) работает и мышью, и пальцем — долгим нажатием
const CAN_DRAG = typeof PointerEvent !== 'undefined';
let pickedColor = PROJ_COLORS[0];
// Обновление из базы пришло, пока открыта форма «Изменить»: перерисуем, когда её закроют,
// иначе форма закрылась бы посреди правки (например, сразу после загрузки файла)
let renderDeferred = false;

// ═══ UTILS ═══
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayKey() { return dateKey(new Date()); }
function parseDate(s) { return s ? new Date(s + 'T12:00:00') : null; }
function fmtTime(t) { return t ? t.slice(0,5) : ''; }
// Сортировка: по дате, затем по времени; задачи без времени — в конце дня
function byDue(a, b) {
  const da = a.dueDate || '9999', db = b.dueDate || '9999';
  if (da !== db) return da < db ? -1 : 1;
  const ta = a.dueTime || '99', tb = b.dueTime || '99';
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

function formatDue(s) {
  if (!s) return null;
  const today = todayKey();
  const tom = dateKey(new Date(Date.now()+86400000));
  if (s === today) return {label:'Сегодня', cls:'today'};
  if (s === tom)   return {label:'Завтра', cls:'future'};
  if (s < today)   return {label:fmtShort(s), cls:'overdue'};
  return {label:fmtShort(s), cls:'future'};
}
function fmtShort(s) {
  const d = parseDate(s);
  return `${d.getDate()} ${RU_MONTHS_G[d.getMonth()].slice(0,3)}`;
}
function recurLabel(r) {
  if (RECUR_LABELS[r]) return RECUR_LABELS[r];
  if (!isRecur(r)) return '';
  const [unit, n] = r.split(':'), k = +n;
  const word = unit === 'days' ? plural(k, 'день', 'дня', 'дней')
             : unit === 'weeks' ? plural(k, 'неделю', 'недели', 'недель')
             : plural(k, 'месяц', 'месяца', 'месяцев');
  return `Раз в ${k} ${word}`;
}
// Прибавить месяцы: 31-е число становится последним днём короткого месяца (как в боте)
function addMonths(d, n) {
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
}
function nextDue(dueDate, recur) {
  const d = parseDate(dueDate) || new Date();
  const [unit, n] = String(recur).split(':'), k = +n || 1;
  if (recur === 'daily')          d.setDate(d.getDate()+1);
  else if (recur === 'weekdays')  { do d.setDate(d.getDate()+1); while (d.getDay() === 0 || d.getDay() === 6); }
  else if (recur === 'weekly')    d.setDate(d.getDate()+7);
  else if (recur === 'monthly')   addMonths(d, 1);
  else if (recur === 'yearly')    addMonths(d, 12);
  else if (unit === 'days')       d.setDate(d.getDate()+k);
  else if (unit === 'weeks')      d.setDate(d.getDate()+7*k);
  else if (unit === 'months')     addMonths(d, k);
  return dateKey(d);
}
// Варианты списка «Повтор»; повтор задачи, которого нет в списке (задан фразой), добавляется в него
function recurOptionsHTML(cur) {
  const list = isRecur(cur) && !RECUR_CHOICES.includes(cur) ? [...RECUR_CHOICES, cur] : RECUR_CHOICES;
  return list.map(r => `<option value="${r}"${r === cur ? ' selected' : ''}>${escHtml(recurLabel(r))}</option>`).join('');
}
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
// Подзадачи — массив {id, text, done} в поле subtasks; из базы и копий берём только такой вид
const SUBTASKS_MAX = 50;
function cleanSubtasks(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(s => s && typeof s.text === 'string' && s.text.trim()).slice(0, SUBTASKS_MAX)
    .map(s => ({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : uid(), text: s.text.trim().slice(0, 200), done: s.done === true }));
}
// Файлы задачи — массив {id, name, path, size, type} в поле files; сами файлы лежат в закрытом
// бакете Storage task-files по пути <telegram_id>/<id задачи>/<id файла>.<расширение> (09_task_files.sql)
const FILES_BUCKET = 'task-files';
const FILES_MAX = 10;
const FILE_MAX_BYTES = 10 * 1024 * 1024; // как file_size_limit бакета
const FILE_PATH_RE = /^\d+\/[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$/;
function cleanFiles(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(f => f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.path === 'string'
      && FILE_PATH_RE.test(f.path)).slice(0, FILES_MAX)
    .map(f => ({ id: f.id.slice(0, 40), name: f.name.slice(0, 120) || 'файл', path: f.path,
                 size: Number.isFinite(f.size) && f.size > 0 ? f.size : 0, type: typeof f.type === 'string' ? f.type.slice(0, 100) : '' }));
}
function fmtSize(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' КБ';
  return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ';
}
function getProject(id) { return projects.find(p => p.id === id) || null; }

// ═══ ЧАСОВОЙ ПОЯС ═══
// Пояс берём у устройства (браузер знает его сам), data.js сохраняет его в user_settings —
// по нему база шлёт напоминания, а бот считает «сегодня». Без записи — московское время.
const TZ_DEFAULT = 'Europe/Moscow';
const TZ_CITIES = {
  'Europe/Kaliningrad': 'Калининград', 'Europe/Moscow': 'Москва', 'Europe/Simferopol': 'Симферополь',
  'Europe/Kirov': 'Киров', 'Europe/Volgograd': 'Волгоград', 'Europe/Samara': 'Самара',
  'Europe/Astrakhan': 'Астрахань', 'Europe/Saratov': 'Саратов', 'Europe/Ulyanovsk': 'Ульяновск',
  'Asia/Yekaterinburg': 'Екатеринбург', 'Asia/Omsk': 'Омск', 'Asia/Novosibirsk': 'Новосибирск',
  'Asia/Barnaul': 'Барнаул', 'Asia/Tomsk': 'Томск', 'Asia/Novokuznetsk': 'Новокузнецк',
  'Asia/Krasnoyarsk': 'Красноярск', 'Asia/Irkutsk': 'Иркутск', 'Asia/Chita': 'Чита',
  'Asia/Yakutsk': 'Якутск', 'Asia/Khandyga': 'Хандыга', 'Asia/Vladivostok': 'Владивосток',
  'Asia/Ust-Nera': 'Усть-Нера', 'Asia/Magadan': 'Магадан', 'Asia/Sakhalin': 'Сахалин',
  'Asia/Srednekolymsk': 'Среднеколымск', 'Asia/Kamchatka': 'Камчатка', 'Asia/Anadyr': 'Анадырь',
  'Europe/Minsk': 'Минск', 'Asia/Almaty': 'Алматы', 'Asia/Tashkent': 'Ташкент', 'Asia/Bishkek': 'Бишкек',
  'Asia/Yerevan': 'Ереван', 'Asia/Tbilisi': 'Тбилиси', 'Asia/Baku': 'Баку', 'Europe/Kiev': 'Киев', 'Europe/Kyiv': 'Киев',
};
function deviceTz() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && /^[A-Za-z][\w+\-]*(\/[\w+\-]+)*$/.test(tz) && tz.length <= 64 ? tz : null;
  } catch (_) { return null; }
}
// Сдвиг пояса от UTC в минутах в момент date
function tzOffsetMin(tz, date) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric' }).formatToParts(date).forEach(x => { p[x.type] = +x.value; });
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}
// «МСК», «МСК+2», «МСК−1», «МСК+2:30»
function mskDiff(tz) {
  let d;
  try { const now = new Date(); d = tzOffsetMin(tz, now) - tzOffsetMin(TZ_DEFAULT, now); } catch (_) { return ''; }
  if (!d) return 'МСК';
  const a = Math.abs(d), m = a % 60;
  return 'МСК' + (d > 0 ? '+' : '−') + Math.floor(a / 60) + (m ? ':' + String(m).padStart(2, '0') : '');
}
function tzCity(tz) {
  return TZ_CITIES[tz] || String(tz).split('/').pop().replace(/_/g, ' ');
}

// ═══ DB MAPPING ═══
function fromDB(row) {
  return {
    id:        row.id,
    text:      row.text,
    cat:       row.cat || null,
    note:      row.note || '',
    done:      row.done || false,
    created:   row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    dueDate:   row.due_date || null,
    dueTime:   row.due_time || null,
    projectId: row.project_id || null,
    recur:     isRecur(row.recur) ? row.recur : null,
    subtasks:  cleanSubtasks(row.subtasks),
    files:     cleanFiles(row.files),
    doneAt:    row.done_at ? new Date(row.done_at).getTime() : null,
  };
}

// ═══ SYNC STATUS ═══
function setSyncStatus(state) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (!dot || !lbl) return;
  dot.className = 'sync-dot ' + state;
  if (state === 'ok')      lbl.textContent = 'Синхронизировано';
  if (state === 'loading') lbl.textContent = 'Синхронизация…';
  if (state === 'err')     lbl.textContent = 'Ошибка связи';
  document.getElementById('sync-indicator').title = lbl.textContent;
}

