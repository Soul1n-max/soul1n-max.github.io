// ═══ ПЕРЕТАСКИВАНИЕ ЗАДАЧ НА ДЕНЬ ═══
// Цели — любые элементы с data-drop="YYYY-MM-DD" (дни календарей, «Ближайшие 7 дней», группы ленты):
// брошенная на цель задача получает её дату. Тянуть можно карточку активной задачи и событие в клетке календаря.
// Мышь: зажать и повести. Палец и перо: удерживать ~350 мс, потом вести — обычный свайп прокручивает страницу.
// Без клавиатурного аналога не остаёмся: дату меняет форма «Изменить» в карточке.
const DRAG_HOLD_MS = 350;   // долгое нажатие на сенсорном экране
const DRAG_SLOP    = 6;     // мышь: на столько пикселей сдвинуть, чтобы начать перенос
const TOUCH_SLOP   = 10;    // палец: сдвинулся раньше времени — это прокрутка, а не перенос
const DRAG_HANDLE  = '.task-item:not(.done), .cal-ev[data-id]';
const DRAG_SKIP    = 'button, a, input, textarea, select, label, summary, form, .done-confirm, .task-note-preview.expanded';

let drag = null;            // текущий перенос: { id, text, from, src, pointerId, touch, x0, y0, x, y, active, ghost, flipTimer }
let dragSuppressClick = false;

function dropTargetsVisible() {
  return [...document.querySelectorAll('[data-drop]')].some(el => el.getClientRects().length);
}
function blockTouchScroll(e) { if (drag && drag.active && e.cancelable) e.preventDefault(); }

document.addEventListener('pointerdown', e => {
  if (drag || e.button !== 0 || !e.isPrimary) return;
  const src = e.target.closest && e.target.closest(DRAG_HANDLE);
  if (!src) return;
  // Галочка, кнопки и поля внутри карточки работают как обычно
  const skip = e.target.closest(DRAG_SKIP);
  if (skip && skip !== src && src.contains(skip)) return;
  if (src.querySelector('.note-row.open')) return;
  const task = tasks.find(t => t.id === src.dataset.id);
  if (!task || task.done || !dropTargetsVisible()) return;
  drag = { id: task.id, text: task.text, from: task.dueDate, src, pointerId: e.pointerId, touch: e.pointerType !== 'mouse',
           x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false };
  if (drag.touch) {
    src.classList.add('drag-hold');
    drag.timer = setTimeout(liftDrag, DRAG_HOLD_MS);
    // touchmove приходит туда, где палец коснулся, даже если перерисовка убрала карточку из DOM
    src.addEventListener('touchmove', blockTouchScroll, { passive: false });
  }
});

document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.active) {
    const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
    if (drag.touch) { if (dist > TOUCH_SLOP) endDrag(); }
    else if (dist > DRAG_SLOP) liftDrag();
    return;
  }
  e.preventDefault();
  moveGhost();
  updateDropOver();
});

document.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  if (!d.active) { endDrag(); return; }
  d.x = e.clientX; d.y = e.clientY;
  const target = dropTargetAt(d.x, d.y);
  endDrag();
  // Отпускание не должно засчитаться кликом по дню (он сменил бы выбранный день)
  dragSuppressClick = true;
  setTimeout(() => { dragSuppressClick = false; }, 0);
  if (target) dropTask(d.id, d.from, target.dataset.drop);
});
document.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pointerId) endDrag(); });
document.addEventListener('click', e => {
  if (!dragSuppressClick) return;
  dragSuppressClick = false;
  e.preventDefault(); e.stopPropagation();
}, true);
document.addEventListener('touchmove', blockTouchScroll, { passive: false });
document.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });
document.addEventListener('dragstart', e => { if (drag) e.preventDefault(); });
document.addEventListener('keydown', e => { if (drag && drag.active && e.key === 'Escape') { e.preventDefault(); endDrag(); } });
window.addEventListener('blur', () => { if (drag) endDrag(); });

function liftDrag() {
  const d = drag;
  if (!d || d.active) return;
  clearTimeout(d.timer);
  d.active = true;
  d.src.classList.remove('drag-hold');
  // Захват на <html>: события пальца не теряются, если перерисовка уберёт исходную карточку
  try { document.documentElement.setPointerCapture(d.pointerId); } catch (err) {}
  const sel = window.getSelection && window.getSelection();
  if (sel) sel.removeAllRanges();
  markDragging();
  document.body.classList.add('dragging-task');
  const g = document.createElement('div');
  g.className = 'drag-ghost' + (d.touch ? ' touch' : '');
  g.setAttribute('aria-hidden', 'true');
  g.textContent = d.text;
  document.body.appendChild(g);
  d.ghost = g;
  moveGhost();
  updateDropOver();
  requestAnimationFrame(autoScroll);
}

// Перерисовка во время переноса создаёт карточки заново — полупрозрачность возвращаем им сами
function markDragging() {
  if (!drag) return;
  const id = CSS.escape(drag.id);
  document.querySelectorAll(`.task-item[data-id="${id}"], .cal-ev[data-id="${id}"]`).forEach(el => el.classList.add('dragging'));
}

function moveGhost() {
  const d = drag, g = d && d.ghost;
  if (!g) return;
  // Под пальцем призрак не видно — держим его над пальцем
  const w = g.offsetWidth;
  const x = Math.max(8, Math.min(innerWidth - w - 8, d.touch ? d.x - w / 2 : d.x + 14));
  const y = d.touch ? d.y - g.offsetHeight - 36 : d.y + 12;
  g.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function dropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.closest('[data-drop]');
}

function updateDropOver() {
  const d = drag;
  if (!d) return;
  const el = document.elementFromPoint(d.x, d.y);
  const t = el && el.closest('[data-drop]');
  document.querySelectorAll('.drop-over').forEach(x => { if (x !== t) x.classList.remove('drop-over'); });
  if (t) t.classList.add('drop-over');
  markDragging();
  // Задержались над стрелкой месяца в календаре — листаем, чтобы бросить задачу в другой месяц
  const nav = el && el.closest('#cal-prev, #cal-next');
  if (nav !== d.flipEl) {
    if (d.flipEl) d.flipEl.classList.remove('drag-flip');
    clearTimeout(d.flipTimer);
    d.flipEl = nav;
    if (nav) {
      nav.classList.add('drag-flip');
      const dir = nav.id === 'cal-next' ? 1 : -1;
      const flip = () => { flipCalMonth(dir); d.flipTimer = setTimeout(flip, 900); };
      d.flipTimer = setTimeout(flip, 600);
    }
  }
}

// Как стрелки календаря, но выбранный день не сбрасывается
function flipCalMonth(dir) {
  calMonth += dir;
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  renderCalendar();
  if (drag) updateDropOver();
}

// Пока тянут, страница сама не прокручивается — прокручиваем у верхнего и нижнего края
function autoScroll() {
  const d = drag;
  if (!d || !d.active) return;
  const mobile = matchMedia('(max-width: 860px)').matches;
  const top = mobile ? 110 : 60, bottom = innerHeight - (mobile ? 120 : 60);
  let dy = 0;
  if (d.y < top) dy = -Math.min(18, Math.ceil((top - d.y) / 5));
  else if (d.y > bottom) dy = Math.min(18, Math.ceil((d.y - bottom) / 5));
  if (dy) {
    const before = scrollY;
    window.scrollBy(0, dy);
    if (scrollY !== before) updateDropOver();
  }
  requestAnimationFrame(autoScroll);
}

function endDrag() {
  const d = drag;
  if (!d) return;
  drag = null;
  clearTimeout(d.timer);
  clearTimeout(d.flipTimer);
  d.src.classList.remove('drag-hold');
  d.src.removeEventListener('touchmove', blockTouchScroll);
  if (d.ghost) d.ghost.remove();
  document.querySelectorAll('.dragging, .drop-over, .drag-flip').forEach(el => el.classList.remove('dragging', 'drop-over', 'drag-flip'));
  document.body.classList.remove('dragging-task');
  try { document.documentElement.releasePointerCapture(d.pointerId); } catch (err) {}
}

// ═══ ПЕРЕНОС, УВЕДОМЛЕНИЕ И ОТМЕНА ═══
function moveDayLabel(key) {
  if (!key) return 'без даты';
  if (key === todayKey()) return 'сегодня';
  if (key === addDays(todayKey(), 1)) return 'завтра';
  const d = parseDate(key);
  return `${d.getDate()} ${RU_MONTHS_G[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

async function dropTask(id, from, to) {
  if (!to || from === to) return;
  await moveTask(id, to);
  const t = tasks.find(x => x.id === id);
  if (!t || t.dueDate !== to) return;   // ошибку уже показал moveTask
  renderAll();
  flashDrop(to);
  showMoveToast(t, from, to);
}

// Короткая вспышка на дне, куда легла задача
function flashDrop(key) {
  document.querySelectorAll(`[data-drop="${key}"]`).forEach(el => {
    el.classList.remove('drop-landed');
    void el.offsetWidth;
    el.classList.add('drop-landed');
    setTimeout(() => el.classList.remove('drop-landed'), 1000);
  });
}

// Для скринридера: вежливое объявление о переносе и об отмене
const dragLive = document.createElement('div');
dragLive.className = 'sr-only';
dragLive.setAttribute('role', 'status');
dragLive.setAttribute('aria-live', 'polite');
document.body.appendChild(dragLive);
function announce(text) {
  dragLive.textContent = '';
  setTimeout(() => { dragLive.textContent = text; }, 50);
}

// Уведомление внизу экрана с кнопкой «Отменить»: после переноса задачи на другой день и после удаления
const moveToast = document.createElement('div');
moveToast.className = 'move-toast';
moveToast.innerHTML = `<span class="mt-text"></span><button type="button" class="mt-undo">Отменить</button>`;
document.body.appendChild(moveToast);
let toastUndo = null, toastTimer = null;

function hideMoveToast() {
  clearTimeout(toastTimer);
  moveToast.classList.remove('show');
  toastUndo = null;
}
function armMoveToast(ms) { clearTimeout(toastTimer); toastTimer = setTimeout(hideMoveToast, ms); }

// text — на уведомлении, say — для скринридера, onUndo — что сделать по «Отменить»
function showUndoToast(text, say, onUndo) {
  toastUndo = onUndo;
  moveToast.querySelector('.mt-text').textContent = text;
  moveToast.classList.add('show');
  armMoveToast(7000);
  announce(say);
}

function showMoveToast(task, from, to) {
  showUndoToast(`Перенесено на ${moveDayLabel(to)}`,
    `Задача «${task.text}» перенесена на ${moveDayLabel(to)}. Отменить можно в уведомлении внизу экрана.`,
    async () => {
      await moveTask(task.id, from);
      const t = tasks.find(x => x.id === task.id);
      if (!t || t.dueDate !== from) return;
      renderAll();
      if (from) flashDrop(from);
      announce(`Перенос отменён: задача снова на ${moveDayLabel(from)}.`);
    });
}

function showDeleteToast(row) {
  showUndoToast('Задача удалена',
    `Задача «${row.text}» удалена. Вернуть её можно кнопкой «Отменить» внизу экрана.`,
    async () => {
      if (!await restoreTask(row)) return;
      renderAll();
      announce(`Задача «${row.text}» возвращена.`);
    });
}

// Пока на уведомлении курсор или фокус, оно не исчезает
moveToast.addEventListener('mouseenter', () => clearTimeout(toastTimer));
moveToast.addEventListener('mouseleave', () => { if (toastUndo) armMoveToast(3000); });
moveToast.addEventListener('focusin',    () => clearTimeout(toastTimer));
moveToast.addEventListener('focusout',   () => { if (toastUndo) armMoveToast(3000); });

moveToast.querySelector('.mt-undo').addEventListener('click', async () => {
  const undo = toastUndo;
  hideMoveToast();
  if (undo) await undo();
});
