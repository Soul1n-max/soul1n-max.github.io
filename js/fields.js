// Свои поля выбора (вместо системных select / date / time), выбор проекта и цвета

// ═══ СВОИ ПОЛЯ ВЫБОРА ═══
// Системные <select> и поля даты/времени остаются в разметке скрытыми и хранят значение (его читает
// остальной код), а вместо них показывается своя кнопка-«пилюля» со своим всплывающим окном.
// На узком экране окно выезжает снизу.
function uiField(el) {
  if (el.uiPill) return;
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'field-pill ui-pill';
  pill.setAttribute('aria-haspopup', el.tagName === 'SELECT' ? 'listbox' : 'dialog');
  pill.setAttribute('aria-expanded', 'false');
  pill.innerHTML = `<span class="pill-k">${escHtml(el.dataset.label)}</span><span class="pill-v"></span><span class="pill-chev">${ICON.chev}</span>`;
  el.uiPill = pill;
  el.uiKind = el.tagName === 'SELECT' ? 'select' : el.type; // select | date | time
  el.classList.add('ui-native');
  el.tabIndex = -1;
  el.before(pill);
  // Значение меняет и остальной код (el.value = …), поэтому перехватываем запись — кнопка не отстаёт
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  Object.defineProperty(el, 'value', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); paintPill(this); },
  });
  pill.addEventListener('click', () => uiPop.el === el ? closePop(true) : openPop(el));
  pill.addEventListener('keydown', e => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && uiPop.el !== el) { e.preventDefault(); openPop(el); }
  });
  paintPill(el);
}
function dateLabel(v) {
  if (v === todayKey()) return 'Сегодня';
  if (v === addDays(todayKey(), 1)) return 'Завтра';
  const d = parseDate(v);
  return `${d.getDate()} ${RU_MONTHS_G[d.getMonth()].slice(0, 3)}` + (d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '');
}
function paintPill(el) {
  const v = el.value;
  let text, dot = '';
  if (el.uiKind === 'select') {
    const o = el.selectedOptions[0];
    text = o ? o.textContent : '';
    if (o && o.value) dot = o.dataset.dot || '';
  } else if (el.uiKind === 'date') text = v ? dateLabel(v) : 'Без даты';
  else text = v ? v.slice(0, 5) : 'Нет';
  el.uiPill.classList.toggle('empty', !v);
  el.uiPill.querySelector('.pill-v').innerHTML =
    (dot ? `<i class="opt-dot" style="background:${escHtml(dot)}"></i>` : '') + `<span>${escHtml(text)}</span>`;
  el.uiPill.setAttribute('aria-label', `${el.dataset.label}: ${text}`);
}
function setFieldValue(el, v) {
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const uiPop = { el: null, box: null, back: null, y: 0, m: 0, focus: null };
const TIME_PRESETS = ['09:00', '12:00', '15:00', '18:00', '20:00'];
const isSheet = () => matchMedia('(max-width: 600px)').matches;

function openPop(el) {
  closePop(false);
  uiPop.el = el;
  const sheet = isSheet();
  if (sheet) {
    uiPop.back = document.createElement('div');
    uiPop.back.className = 'ui-backdrop';
    uiPop.back.addEventListener('click', () => closePop(true));
    document.body.appendChild(uiPop.back);
  }
  const box = document.createElement('div');
  box.className = 'ui-pop' + (sheet ? ' sheet' : '');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', el.dataset.label);
  box.addEventListener('keydown', popKeydown);
  box.addEventListener('click', popClick);
  box.addEventListener('focusout', e => {
    // Фокус ушёл из окна (Tab) — закрываем; null бывает при перерисовке содержимого, его пропускаем
    if (e.relatedTarget && !box.contains(e.relatedTarget) && e.relatedTarget !== el.uiPill) closePop(false);
  });
  uiPop.box = box;
  document.body.appendChild(box);
  el.uiPill.setAttribute('aria-expanded', 'true');
  if (el.uiKind === 'date') {
    uiPop.focus = el.value || todayKey();
    const d = parseDate(uiPop.focus); uiPop.y = d.getFullYear(); uiPop.m = d.getMonth();
  }
  renderPop();
  placePop();
  const first = box.querySelector('[aria-selected="true"], .mc-day[tabindex="0"], .ui-opt, .pop-chip');
  if (first) first.focus({ preventScroll: true });
}
function closePop(returnFocus) {
  if (!uiPop.el) return;
  const el = uiPop.el;
  uiPop.box.remove();
  if (uiPop.back) uiPop.back.remove();
  el.uiPill.setAttribute('aria-expanded', 'false');
  uiPop.el = uiPop.box = uiPop.back = null;
  if (returnFocus && el.uiPill.isConnected) el.uiPill.focus();
}
function renderPop() {
  const el = uiPop.el, box = uiPop.box;
  const title = `<div class="ui-pop-title">${escHtml(el.dataset.label)}</div>`;
  const opt = (v, text, on, dot) => `<button type="button" class="ui-opt" role="option" data-v="${escHtml(v)}" aria-selected="${on}">` +
    (dot ? `<i class="opt-dot" style="background:${escHtml(dot)}"></i>` : '') +
    `<span class="opt-text">${escHtml(text)}</span><span class="opt-check">${ICON.check}</span></button>`;

  if (el.uiKind === 'select') {
    box.style.width = '';
    box.innerHTML = title + `<div class="ui-list" role="listbox" aria-label="${escHtml(el.dataset.label)}">` +
      [...el.options].map(o => opt(o.value, o.textContent, o.selected, o.value ? o.dataset.dot : '')).join('') + '</div>';
  } else if (el.uiKind === 'date') {
    const v = el.value, today = todayKey();
    const focusKey = [uiPop.focus, v, today].find(k => sameMonth(k, uiPop.y, uiPop.m)) || dateKey(new Date(uiPop.y, uiPop.m, 1));
    const chip = (k, text) => `<button type="button" class="pop-chip${v === k ? ' on' : ''}" data-v="${k}">${text}</button>`;
    box.innerHTML = title + `<div class="dp">
      <div class="mc-head"><div class="mc-title">${monthTitle(uiPop.y, uiPop.m)}</div>
        <button type="button" class="mc-nav prev" data-nav="-1" aria-label="Предыдущий месяц">${ICON.chev}</button>
        <button type="button" class="mc-nav" data-nav="1" aria-label="Следующий месяц">${ICON.chev}</button></div>
      <div class="dp-grid">${monthGridHTML(uiPop.y, uiPop.m, { selected: v, focusKey, marks: activeByDate() })}</div></div>
      <div class="pop-foot">${chip(today, 'Сегодня')}${chip(addDays(today, 1), 'Завтра')}${chip(addDays(today, 7), 'Через неделю')}` +
      // data-required на поле — дата обязательна, убрать её нельзя
      (v && !el.hasAttribute('data-required') ? '<button type="button" class="pop-chip clear" data-v="">Убрать</button>' : '') + '</div>';
  } else {
    const v = el.value ? el.value.slice(0, 5) : '';
    const [hh, mm] = v ? v.split(':') : ['', ''];
    const mins = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
    if (mm && !mins.includes(mm)) { mins.push(mm); mins.sort(); }
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    box.innerHTML = title +
      `<div class="tp-quick">${TIME_PRESETS.map(t => `<button type="button" class="pop-chip${t === v ? ' on' : ''}" data-v="${t}">${t}</button>`).join('')}</div>
      <div class="tp-cols">
        <div><div class="tp-col-h">Часы</div><div class="tp-col" role="listbox" aria-label="Часы" data-part="h">${hours.map(h => opt(h, h, h === hh)).join('')}</div></div>
        <div><div class="tp-col-h">Минуты</div><div class="tp-col" role="listbox" aria-label="Минуты" data-part="m">${mins.map(m => opt(m, m, m === mm)).join('')}</div></div>
      </div>
      <div class="pop-foot">${v ? '<button type="button" class="pop-chip clear" data-v="">Убрать</button>' : ''}<button type="button" class="pop-chip done" data-done>Готово</button></div>`;
    box.querySelectorAll('.tp-col').forEach(col => {
      const s = col.querySelector('[aria-selected="true"]') || (col.dataset.part === 'h' && col.children[9]);
      if (s) col.scrollTop = s.offsetTop - col.offsetTop - col.clientHeight / 2 + s.offsetHeight / 2;
    });
  }
}
function placePop() {
  const { el, box } = uiPop;
  if (!el || box.classList.contains('sheet')) return;
  if (!el.uiPill.isConnected) { closePop(false); return; }
  const r = el.uiPill.getBoundingClientRect();
  const w = el.uiKind === 'select' ? Math.min(Math.max(r.width, 220), 300) : el.uiKind === 'date' ? 320 : 280;
  box.style.width = w + 'px';
  box.style.maxHeight = '';
  const h = box.offsetHeight;
  const below = innerHeight - r.bottom - 14, above = r.top - 14;
  box.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  if (h <= below || below >= above) {
    box.style.top = (r.bottom + 6) + 'px';
    box.style.maxHeight = below + 'px';
  } else {
    box.style.top = Math.max(8, r.top - 6 - Math.min(h, above)) + 'px';
    box.style.maxHeight = above + 'px';
  }
}
function popClick(e) {
  const el = uiPop.el;
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    uiPop.m += +nav.dataset.nav;
    if (uiPop.m < 0) { uiPop.m = 11; uiPop.y--; }
    if (uiPop.m > 11) { uiPop.m = 0; uiPop.y++; }
    uiPop.focus = null;
    renderPop();
    uiPop.box.querySelector(`[data-nav="${nav.dataset.nav}"]`).focus();
    return;
  }
  if (e.target.closest('[data-done]')) { closePop(true); return; }
  const day = e.target.closest('.mc-day');
  if (day) { setFieldValue(el, day.dataset.key); closePop(true); return; }
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const part = b.closest('.tp-col') && b.closest('.tp-col').dataset.part;
  if (part) {
    // Час выбран — окно остаётся открытым для минут; минуты выбраны — время готово
    const cur = el.value ? el.value.slice(0, 5).split(':') : null;
    const nextHour = String((new Date().getHours() + 1) % 24).padStart(2, '0');
    const val = part === 'h' ? `${b.dataset.v}:${cur ? cur[1] : '00'}` : `${cur ? cur[0] : nextHour}:${b.dataset.v}`;
    setFieldValue(el, val);
    if (part === 'm') { closePop(true); return; }
    b.parentElement.querySelectorAll('.ui-opt').forEach(o => o.setAttribute('aria-selected', o === b));
    const mm = val.slice(3);
    uiPop.box.querySelectorAll('[data-part="m"] .ui-opt').forEach(o => o.setAttribute('aria-selected', o.dataset.v === mm));
    uiPop.box.querySelectorAll('.tp-quick .pop-chip').forEach(o => o.classList.toggle('on', o.dataset.v === val));
    (uiPop.box.querySelector('[data-part="m"] [aria-selected="true"]') || b).focus();
    return;
  }
  setFieldValue(el, b.dataset.v);
  closePop(true);
}
function popKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(true); return; }
  const day = e.target.closest('.mc-day');
  if (day) {
    const next = gridKey(e, day.dataset.key);
    if (!next) return;
    e.preventDefault();
    const d = parseDate(next);
    uiPop.focus = next; uiPop.y = d.getFullYear(); uiPop.m = d.getMonth();
    renderPop();
    uiPop.box.querySelector(`.mc-day[data-key="${next}"]`).focus();
    return;
  }
  const o = e.target.closest('.ui-opt');
  if (!o) return;
  const items = [...o.parentElement.querySelectorAll('.ui-opt')];
  const i = items.indexOf(o);
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  items[Math.max(0, Math.min(items.length - 1, to))].focus();
}
document.addEventListener('pointerdown', e => {
  if (uiPop.el && !uiPop.box.contains(e.target) && !uiPop.el.uiPill.contains(e.target) && !(uiPop.back && uiPop.back === e.target)) closePop(false);
}, true);
window.addEventListener('scroll', e => { if (uiPop.el && !uiPop.box.contains(e.target)) placePop(); }, true);
window.addEventListener('resize', () => closePop(false));
document.getElementById('task-recur').insertAdjacentHTML('beforeend', recurOptionsHTML(''));
document.querySelectorAll('#tab-tasks .quick-add .ui-field').forEach(uiField);
// Повтор, заданный фразой («каждые 5 дней»), может не быть в списке — добавляем его
function setRecurField(el, v) {
  if (v && ![...el.options].some(o => o.value === v)) {
    const o = document.createElement('option');
    o.value = v; o.textContent = recurLabel(v);
    el.appendChild(o);
  }
  el.value = v || '';
}

// ═══ PROJECT SELECT ═══
function updateProjectSelect() {
  const sel = document.getElementById('task-project');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Без проекта</option>';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name; opt.dataset.dot = p.color;
    sel.appendChild(opt);
  });
  sel.value = projects.find(p => p.id===cur) ? cur : '';
}

// ═══ COLOR PICKER ═══
function initColorPicker() {
  const cp = document.getElementById('color-picker');
  cp.innerHTML = '';
  PROJ_COLORS.forEach(c => {
    const s = document.createElement('button');
    s.className = 'color-swatch' + (c===pickedColor?' selected':'');
    s.style.background = c;
    s.dataset.color = c;
    s.setAttribute('aria-label', 'Цвет ' + c);
    s.setAttribute('aria-pressed', c===pickedColor);
    s.addEventListener('click', () => {
      pickedColor = c;
      document.querySelectorAll('.color-swatch').forEach(sw => {
        const on = sw.dataset.color === c;
        sw.classList.toggle('selected', on);
        sw.setAttribute('aria-pressed', on);
      });
    });
    cp.appendChild(s);
  });
}

