import { MIN_SIZE, MAX_SIZE, items, state } from './state.js';
import { board, reportError } from './ui.js';
import { api } from './api.js';
import { poll } from './sync.js';
import { snapTo, showGrid } from './snap.js';

// Slepen en schalen (Pointer Events)
let drag = null, resize = null;

board.addEventListener('pointerdown', (e) => {
  const item = e.target.closest('.item');
  if (!item || e.button > 0) return;

  const handle = e.target.closest('.resize-handle');
  if (handle) {
    const n = items.get(Number(item.dataset.id));
    resize = { item, n, sx: e.clientX, sy: e.clientY, ow: n.w, oh: n.h, id: e.pointerId };
    state.busy = true;
    item.focus({ preventScroll: true });
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  if (e.target.closest('button, a')) return;
  // notities sleep je alleen via de kop; de tekst blijft selecteerbaar
  if (item.classList.contains('note') && !e.target.closest('.note-head')) return;
  const n = items.get(Number(item.dataset.id));
  drag = { item, n, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false, id: e.pointerId };
  item.setPointerCapture(e.pointerId);
});

board.addEventListener('pointermove', (e) => {
  if (resize && e.pointerId === resize.id) {
    const { n, item } = resize;
    n.w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(resize.ow + (e.clientX - resize.sx) / state.zoom)));
    n.h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(resize.oh + (e.clientY - resize.sy) / state.zoom)));
    item.style.width = n.w + 'px';
    item.style.height = n.h + 'px';
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const dx = (e.clientX - drag.sx) / state.zoom, dy = (e.clientY - drag.sy) / state.zoom; // schermpixels -> bordcoördinaten
  if (!drag.moved && Math.hypot(dx, dy) * state.zoom < 4) return;
  if (!drag.moved) {
    drag.moved = true; state.busy = true;
    drag.item.classList.add('dragging');
    showGrid(drag.n.type === 'note');
    const focused = document.activeElement;
    board.appendChild(drag.item); // naar voren; herstel daarna de focus
    if (focused === drag.item) drag.item.focus({ preventScroll: true });
  }
  const grid = drag.n.type === 'note' ? snapTo : (v) => v;
  drag.n.x = Math.max(0, grid(Math.round(drag.ox + dx)));
  drag.n.y = Math.max(0, grid(Math.round(drag.oy + dy)));
  drag.item.style.left = drag.n.x + 'px';
  drag.item.style.top = drag.n.y + 'px';
});

function endPointer(e) {
  if (resize && e.pointerId === resize.id) {
    const n = resize.n;
    resize = null; state.busy = false;
    api({ action: 'resize', id: n.id, w: n.w, h: n.h }).then(poll).catch((err) => reportError(new Error('Formaat opslaan mislukt: ' + err.message)));
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const { n, item, moved } = drag;
  drag = null; state.busy = false;
  item.classList.remove('dragging');
  showGrid(false);
  if (moved) saveMove(n); // alleen opslaan als er echt is versleept
}
board.addEventListener('pointerup', endPointer);
board.addEventListener('pointercancel', endPointer);

export async function saveMove(n) {
  try {
    await api({ action: 'move', id: n.id, x: n.x, y: n.y });
    poll();
  } catch (err) {
    reportError(new Error('Positie opslaan mislukt: ' + err.message));
  }
}
