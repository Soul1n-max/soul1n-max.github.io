// Ввод фразой: «Позвонить Ивану завтра в 15:30 #срочно» → задача «Позвонить Ивану» на завтра, 15:30, тип «Срочно».
// parsePhrase(text) возвращает { text, due, time, cat, recur, projectId, found }: найденное вырезается из текста,
// found — подписи для подсказки под полем. Не найденное остаётся null, и тогда работают поля под строкой ввода.
// Те же правила — в боте (parse_phrase в bot_webhook.py): меняя здесь, поменяй и там.

// Граница слова: \b в JS не знает русских букв
const PH_L = '(?<![\\p{L}\\d])';
const PH_R = '(?![\\p{L}\\d])';
const phRe = src => new RegExp(PH_L + '(?:' + src + ')' + PH_R, 'iu');

const PH_NUM = { 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7, 'десять': 10 };
const PH_NUM_SRC = '\\d{1,3}|два|две|три|четыре|пять|шесть|семь|десять';
const phNum = s => s ? (PH_NUM[s.toLowerCase()] || parseInt(s, 10)) : 1;

// День недели: номер как в getDay() (0 — воскресенье) и формы: «в среду», «к среде», «до среды», «по средам»
const PH_WEEKDAYS = [
  [1, 'понедельник', 'понедельнику', 'понедельника', 'понедельникам'],
  [2, 'вторник', 'вторнику', 'вторника', 'вторникам'],
  [3, 'среду|среда', 'среде', 'среды', 'средам'],
  [4, 'четверг', 'четвергу', 'четверга', 'четвергам'],
  [5, 'пятницу|пятница', 'пятнице', 'пятницы', 'пятницам'],
  [6, 'субботу|суббота', 'субботе', 'субботы', 'субботам'],
  [0, 'воскресенье', 'воскресенью', 'воскресенья', 'воскресеньям'],
];
const PH_WD_SHORT = { 'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 0 };
const PH_MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма[йя]', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const PH_MONTH_SRC = 'января|янв|февраля|фев|марта|мар|апреля|апр|мая|июня|июн|июля|июл|августа|авг|сентября|сент|сен|октября|окт|ноября|нояб|ноя|декабря|дек';
const PH_CATS = { 'проект': 'project', 'контакт': 'contact', 'напомнить': 'remind', 'срочно': 'urgent', 'личное': 'personal' };

function phAddDays(key, n) { const d = parseDate(key); d.setDate(d.getDate() + n); return dateKey(d); }
// Ближайший такой день недели, считая сегодня
function phNextWeekday(today, wd) {
  const d = parseDate(today);
  d.setDate(d.getDate() + (wd - d.getDay() + 7) % 7);
  return dateKey(d);
}
function phValidDate(y, m, d) {
  const dt = new Date(y, m - 1, d, 12);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dateKey(dt) : null;
}
// День и месяц без года: если дата уже прошла — следующий год
function phDayMonth(today, d, m, y) {
  if (y) return phValidDate(y < 100 ? 2000 + y : y, m, d);
  const year = +today.slice(0, 4);
  const k = phValidDate(year, m, d);
  return k && k < today ? phValidDate(year + 1, m, d) : k;
}

function parsePhrase(input, today = todayKey()) {
  let s = ' ' + String(input) + ' ';
  const res = { text: String(input).trim(), due: null, time: null, cat: null, recur: null, projectId: null, found: [] };
  // Находит первое совпадение, вырезает его из строки и отдаёт группы
  const take = re => {
    const m = re.exec(s);
    if (!m) return null;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return m;
  };
  const wdForm = i => PH_WEEKDAYS.map(w => w[i]).join('|');
  const wdOf = word => PH_WEEKDAYS.find(w => new RegExp('^(?:' + w.slice(1).join('|') + ')$', 'iu').test(word))?.[0];

  // ── Повтор ──
  let m;
  if ((m = take(phRe('(?:каждый|каждую|каждое)\\s+(' + wdForm(1) + ')|по\\s+(' + wdForm(4) + ')')))) {
    res.recur = 'weekly';
    res.due = phNextWeekday(today, wdOf(m[1] || m[2]));
  } else if (take(phRe('по\\s+будням|в\\s+будни|каждый\\s+будний\\s+день'))) res.recur = 'weekdays';
  else if (take(phRe('ежедневно|каждый\\s+день'))) res.recur = 'daily';
  else if (take(phRe('еженедельно|каждую\\s+неделю'))) res.recur = 'weekly';
  else if (take(phRe('ежемесячно|каждый\\s+месяц'))) res.recur = 'monthly';
  else if (take(phRe('ежегодно|каждый\\s+год'))) res.recur = 'yearly';
  else if ((m = take(phRe('(?:каждые|раз\\s+в)\\s+(?:(' + PH_NUM_SRC + ')\\s+)?(день|дня|дней|неделю|недели|недель|месяц|месяца|месяцев|год)')))) {
    const n = phNum(m[1]), unit = m[2].toLowerCase();
    const kind = unit.startsWith('д') ? 'days' : unit.startsWith('н') ? 'weeks' : unit.startsWith('м') ? 'months' : 'year';
    if (kind === 'year') res.recur = 'yearly';
    else if (n === 1) res.recur = { days: 'daily', weeks: 'weekly', months: 'monthly' }[kind];
    else if (n <= 365) res.recur = `${kind}:${n}`;
  }

  // ── Тип и проект: #срочно, #личное, #Название проекта; «срочно» можно и без решётки ──
  if ((m = take(phRe('#(' + Object.keys(PH_CATS).join('|') + ')|срочно')))) res.cat = PH_CATS[(m[1] || 'срочно').toLowerCase()];
  const projs = [...projects].sort((a, b) => b.name.length - a.name.length);
  for (const p of projs) {
    const name = p.name.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s_]+');
    if (name && take(new RegExp('#' + name + PH_R, 'iu'))) { res.projectId = p.id; break; }
  }

  // ── Дата ──
  if (!res.due) {
    if (take(phRe('\\/?послезавтра'))) res.due = phAddDays(today, 2);
    else if (take(phRe('\\/?завтра'))) res.due = phAddDays(today, 1);
    else if (take(phRe('\\/?сегодня'))) res.due = today;
    // «через день» не берём: его часто пишут в значении «через день по очереди»
    else if ((m = take(phRe('через\\s+(?:(' + PH_NUM_SRC + ')\\s+(день|дня|дней|неделю|недели|недель|месяц|месяца|месяцев)|(неделю|месяц))')))) {
      const n = phNum(m[1]), unit = (m[2] || m[3]).toLowerCase();
      if (unit.startsWith('д')) res.due = phAddDays(today, n);
      else if (unit.startsWith('н')) res.due = phAddDays(today, 7 * n);
      else { const d = parseDate(today); addMonths(d, n); res.due = dateKey(d); }
    }
    else if (take(phRe('на\\s+следующей\\s+неделе'))) res.due = phNextWeekday(phAddDays(today, 1), 1);
    else if ((m = take(phRe('(?:(?:в|во|на)\\s+)?(' + wdForm(1) + ')|к\\s+(' + wdForm(2) + ')|до\\s+(' + wdForm(3) + ')'))))
      res.due = phNextWeekday(today, wdOf(m[1] || m[2] || m[3]));
    else if ((m = take(phRe('(?:в|во|к|до|на)\\s+(пн|вт|ср|чт|пт|сб|вс)')))) res.due = phNextWeekday(today, PH_WD_SHORT[m[1].toLowerCase()]);
    else if ((m = take(phRe('\\/?(\\d{4})-(\\d{2})-(\\d{2})')))) res.due = phValidDate(+m[1], +m[2], +m[3]);
    else if ((m = take(phRe('(?:(?:к|до|на)\\s+)?(\\d{1,2})\\s+(' + PH_MONTH_SRC + ')\\.?(?:\\s+(\\d{4}))?')))) {
      const mon = PH_MONTHS.findIndex(x => new RegExp('^' + x, 'iu').test(m[2])) + 1;
      res.due = phDayMonth(today, +m[1], mon, m[3] ? +m[3] : 0);
    }
    else {
      // 25.11 или 25.11.2026; «15.30» — не дата (месяца 30 нет), его не трогаем
      const re = phRe('(?:(?:в|к|до|на)\\s+)?\\/?(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2}|\\d{4}))?');
      const mm = re.exec(s);
      if (mm && phDayMonth(today, +mm[1], +mm[2], mm[3] ? +mm[3] : 0)) {
        take(re);
        res.due = phDayMonth(today, +mm[1], +mm[2], mm[3] ? +mm[3] : 0);
      }
    }
  }
  if (res.recur === 'weekdays') {
    // Повтор по будням не начинается в выходной
    let d = res.due || today;
    while ([0, 6].includes(parseDate(d).getDay())) d = phAddDays(d, 1);
    if (d !== today || res.due) res.due = d;
  }

  // ── Время: 15:30 где угодно; 15.30 — только после «в», «к», «до» (без них это могла бы быть дата);
  //    в полдень; «в 15», «в 9 утра», «в 7 вечера» — только если дальше нет слова («встреча в 2 этапа» не время) ──
  if ((m = take(phRe('(?:(?:в|к|до)\\s+)?(\\d{1,2}):(\\d{2})|(?:в|к|до)\\s+(\\d{1,2})\\.(\\d{2})')))) {
    const h = +(m[1] || m[3]), mi = m[2] || m[4];
    if (h < 24 && +mi < 60) res.time = `${String(h).padStart(2, '0')}:${mi}`;
  } else if (take(phRe('в\\s+полдень'))) res.time = '12:00';
  else {
    const re = new RegExp(PH_L + '(?:в|к)\\s+(\\d{1,2})(?:\\s*(?:ч|час|часа|часов)\\.?)?(?:\\s+(утра|дня|вечера|ночи))?(?=\\s*(?:[,.;!?)](?!\\d)|$))', 'iu');
    const mm = re.exec(s);
    if (mm) {
      let h = +mm[1];
      const part = (mm[2] || '').toLowerCase();
      if ((part === 'дня' || part === 'вечера') && h < 12) h += 12;
      if (part === 'ночи' && h === 12) h = 0;
      if (!part && h >= 1 && h <= 6) h += 12;   // «в 3» без уточнения — это 15:00, а не ночь
      if (h < 24) { take(re); res.time = `${String(h).padStart(2, '0')}:00`; }
    }
  }

  // ── Что осталось — текст задачи ──
  let text = s.replace(/\s+/g, ' ').replace(/\s+([,.;!?])/g, '$1').replace(/^[\s,.;:—–-]+|[\s,;:—–-]+$/g, '').trim();
  if (!text || (!res.due && !res.time && !res.cat && !res.recur && !res.projectId)) text = String(input).trim();
  else if (/^\p{Lu}/u.test(String(input).trim())) text = text[0].toUpperCase() + text.slice(1);
  res.text = text;

  if (res.due)       res.found.push(dateLabel(res.due));
  if (res.time)      res.found.push(res.time);
  if (res.cat)       res.found.push(CATS[res.cat].label);
  if (res.recur)     res.found.push(recurLabel(res.recur));
  if (res.projectId) res.found.push(getProject(res.projectId).name);
  return res;
}
