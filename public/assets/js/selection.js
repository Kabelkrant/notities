import { els, selected } from './state.js';
import { board } from './ui.js';

// Meervoudige selectie: rechthoekig selectiekader (muis) en Ctrl+klik
const MIN_OVERLAP = 0.25; // aandeel van een item dat in het kader moet vallen

function mark() {
  for (const [id, el] of els) el.classList.toggle('selected', selected.has(id));
}

export function clearSelection() {
  if (!selected.size) return;
  selected.clear();
  mark();
}

export function toggleSelected(id) {
  if (!selected.delete(id)) selected.add(id);
  mark();
}

let box = null, band = null;

// Klikken op leeg bord heft de selectie op (slepen daar pant het bord); Shift+slepen trekt een kader, met Ctrl erbij wordt toegevoegd
board.addEventListener('pointerdown', (e) => {
  if (e.target !== board || e.button !== 0) return;
  if (!e.shiftKey) { if (!e.ctrlKey && !e.metaKey) clearSelection(); return; }
  const add = e.ctrlKey || e.metaKey;
  if (!add) clearSelection();
  document.activeElement?.blur?.();
  e.preventDefault();
  band = document.createElement('div');
  band.className = 'marquee';
  board.appendChild(band);
  board.setPointerCapture(e.pointerId);
  box = { id: e.pointerId, sx: e.clientX, sy: e.clientY, base: add ? new Set(selected) : new Set() };
  update(e);
});

function update(e) {
  const r = board.getBoundingClientRect();
  const x1 = Math.min(box.sx, e.clientX), x2 = Math.max(box.sx, e.clientX);
  const y1 = Math.min(box.sy, e.clientY), y2 = Math.max(box.sy, e.clientY);
  band.style.left = x1 - r.left + 'px';
  band.style.top = y1 - r.top + 'px';
  band.style.width = x2 - x1 + 'px';
  band.style.height = y2 - y1 + 'px';
  selected.clear();
  for (const id of box.base) selected.add(id);
  for (const [id, el] of els) {
    if (el.hidden) continue;
    const b = el.getBoundingClientRect(), area = b.width * b.height;
    const w = Math.min(b.right, x2) - Math.max(b.left, x1), h = Math.min(b.bottom, y2) - Math.max(b.top, y1);
    if (area > 0 && w > 0 && h > 0 && w * h / area > MIN_OVERLAP) selected.add(id);
  }
  mark();
}

board.addEventListener('pointermove', (e) => { if (box && e.pointerId === box.id) update(e); });
function end(e) {
  if (!box || e.pointerId !== box.id) return;
  band.remove(); band = box = null;
}
board.addEventListener('pointerup', end);
board.addEventListener('pointercancel', end);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected.size && !document.querySelector('dialog[open]')) clearSelection(); });
