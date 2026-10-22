import { items, els, state, selected } from './state.js';
import { toggleSelected, clearSelection } from './selection.js';
import { board, reportError } from './ui.js';
import { api } from './api.js';
import { poll } from './sync.js';
import { snapTo, showGrid } from './snap.js';
import { paint } from './render.js';
import { TYPES } from './types.js';

// Slepen, schalen en roteren (Pointer Events)
let drag = null, resize = null, rotate = null;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

board.addEventListener('pointerdown', (e) => {
  const item = e.target.closest('.item');
  if (!item || e.button > 0) return;
  const n = items.get(Number(item.dataset.id));

  if ((e.ctrlKey || e.metaKey) && !e.target.closest('button, a')) { // Ctrl+klik: item aan/uit de selectie
    toggleSelected(n.id);
    e.preventDefault();
    return;
  }
  if (!selected.has(n.id)) clearSelection();

  const rot = e.target.closest('.rotate-handle');
  if (rot) {
    const r = item.getBoundingClientRect();
    // de omhullende van een geroteerd element heeft hetzelfde middelpunt als het element zelf
    rotate = { item, n, cx: r.left + r.width / 2, cy: r.top + r.height / 2, id: e.pointerId };
    state.busy = true;
    item.focus({ preventScroll: true });
    rot.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  const handle = e.target.closest('.resize-handle');
  if (handle) {
    resize = { item, n, sx: e.clientX, sy: e.clientY, ow: n.w, oh: n.h, ox: n.x, oy: n.y, rot: n.rot || 0, id: e.pointerId };
    state.busy = true;
    item.focus({ preventScroll: true });
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  if (e.target.closest('button, a')) return;
  // notities sleep je alleen via de kop; de tekst blijft selecteerbaar
  if (item.classList.contains('note') && !e.target.closest('.note-head')) return;
  // een geselecteerd item sleept de hele selectie mee
  const group = selected.has(n.id) ? [...selected].filter((id) => els.has(id)).map((id) => ({ n: items.get(id), el: els.get(id), ox: items.get(id).x, oy: items.get(id).y })) : [{ n, el: item, ox: n.x, oy: n.y }];
  drag = { item, n, group, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false, id: e.pointerId };
  item.setPointerCapture(e.pointerId);
});

// Schalen in de eigen (geroteerde) assen van het item; de linkerbovenhoek blijft op het scherm op dezelfde plek staan
function resizeBox(e) {
  const { n, item } = resize, r = TYPES[n.type].resize, z = state.zoom, t = resize.rot * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t);
  const dx = (e.clientX - resize.sx) / z, dy = (e.clientY - resize.sy) / z;
  const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos; // aanwijzerbeweging in de assen van het item
  let nw, nh;
  if (r.keepRatio && e.shiftKey) { // met Shift blijft de verhouding gelijk: de hoek wordt op de diagonaal geprojecteerd
    const ow = resize.ow, oh = resize.oh;
    const s = ((ow + lx) * ow + (oh + ly) * oh) / (ow * ow + oh * oh);
    nw = clamp(Math.round(ow * s), r.min, r.max);
    nh = clamp(Math.round(nw * oh / ow), r.minH, r.maxH);
  } else { // standaard vrij: breedte en hoogte los van elkaar
    nw = clamp(Math.round(resize.ow + lx), r.min, r.max);
    nh = clamp(Math.round(resize.oh + ly), r.minH, r.maxH);
  }
  const rotv = (a, b) => [a * cos - b * sin, a * sin + b * cos];
  const [pdx, pdy] = rotv(-resize.ow / 2, -resize.oh / 2);
  const px = resize.ox + resize.ow / 2 + pdx, py = resize.oy + resize.oh / 2 + pdy; // vaste hoek
  const [ndx, ndy] = rotv(nw / 2, nh / 2);
  n.w = nw; n.h = nh;
  n.x = Math.max(0, Math.round(px + ndx - nw / 2));
  n.y = Math.max(0, Math.round(py + ndy - nh / 2));
  paint(item, n);
}

board.addEventListener('pointermove', (e) => {
  if (rotate && e.pointerId === rotate.id) {
    let deg = Math.atan2(e.clientY - rotate.cy, e.clientX - rotate.cx) * 180 / Math.PI + 90; // greepje zit boven het midden
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    rotate.n.rot = ((Math.round(deg) % 360) + 360) % 360;
    paint(rotate.item, rotate.n);
    return;
  }
  if (resize && e.pointerId === resize.id) {
    const { n, item } = resize, r = TYPES[n.type].resize;
    if (r.mode === 'box') return resizeBox(e);
    if (r.mode === 'square') {
      const d = ((e.clientX - resize.sx) + (e.clientY - resize.sy)) / 2 / state.zoom; // vierkant: gemiddelde van de x- en y-beweging
      n.w = n.h = clamp(Math.round(resize.ow + d), r.min, r.max);
      return paint(item, n);
    }
    n.w = clamp(Math.round(resize.ow + (e.clientX - resize.sx) / state.zoom), r.min, r.max);
    n.h = clamp(Math.round(resize.oh + (e.clientY - resize.sy) / state.zoom), r.min, r.max);
    item.style.width = n.w + 'px';
    item.style.height = n.h + 'px';
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const dx = (e.clientX - drag.sx) / state.zoom, dy = (e.clientY - drag.sy) / state.zoom; // schermpixels -> bordcoördinaten
  if (!drag.moved && Math.hypot(dx, dy) * state.zoom < 4) return;
  if (!drag.moved) {
    drag.moved = true; state.busy = true;
    showGrid(drag.n.type === 'note');
    const focused = document.activeElement;
    for (const g of drag.group) { g.el.classList.add('dragging'); board.appendChild(g.el); } // naar voren; herstel daarna de focus
    if (focused === drag.item) drag.item.focus({ preventScroll: true });
  }
  // de verschuiving volgt het raster van het gesleepte item; geen enkel item mag links of boven het bord uitkomen
  const grid = drag.n.type === 'note' ? snapTo : (v) => v;
  const ddx = Math.max(grid(Math.round(drag.ox + dx)) - drag.ox, -Math.min(...drag.group.map((g) => g.ox)));
  const ddy = Math.max(grid(Math.round(drag.oy + dy)) - drag.oy, -Math.min(...drag.group.map((g) => g.oy)));
  for (const g of drag.group) {
    g.n.x = g.ox + ddx; g.n.y = g.oy + ddy;
    g.el.style.left = g.n.x + 'px';
    g.el.style.top = g.n.y + 'px';
  }
});

function endPointer(e) {
  if (rotate && e.pointerId === rotate.id) {
    const n = rotate.n;
    rotate = null; state.busy = false;
    saveItem(n, { rot: n.rot });
    return;
  }
  if (resize && e.pointerId === resize.id) {
    const n = resize.n;
    resize = null; state.busy = false;
    saveItem(n, Object.fromEntries(TYPES[n.type].resize.fields.map((k) => [k, n[k]])), 'Formaat opslaan mislukt');
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const { group, moved } = drag;
  drag = null; state.busy = false;
  for (const g of group) g.el.classList.remove('dragging');
  showGrid(false);
  if (moved) saveMoves(group.map((g) => g.n)); // alleen opslaan als er echt is versleept
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

async function saveMoves(list) {
  if (list.length === 1) return saveMove(list[0]);
  try {
    await Promise.all(list.map((n) => api({ action: 'move', id: n.id, x: n.x, y: n.y })));
    poll();
  } catch (err) {
    reportError(new Error('Positie opslaan mislukt: ' + err.message));
  }
}

// Wijzigingen aan een item (rotatie, formaat, ...) opslaan
export async function saveItem(n, fields, failure = 'Opslaan mislukt') {
  try {
    await api({ action: 'item_update', id: n.id, ...fields });
    poll();
  } catch (err) {
    reportError(new Error(failure + ': ' + err.message));
  }
}
