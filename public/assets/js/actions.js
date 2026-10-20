import { UNDO_MS, GRID, items, els, pendingDelete, state } from './state.js';
import { snapTo, showGrid } from './snap.js';
import { board, reportError, showToast, hideToast } from './ui.js';
import { api } from './api.js';
import { paint, remove } from './render.js';
import { poll } from './sync.js';
import { openDialog } from './dialog.js';
import { saveMove, saveArrow } from './drag.js';
import { openArrowDialog } from './arrow.js';
import { openClockDialog } from './clock.js';

// Bewerken / verwijderen / toetsenbord
board.addEventListener('click', (e) => {
  const item = e.target.closest('.item'); if (!item) return;
  const id = Number(item.dataset.id);
  if (e.target.closest('.edit-btn')) { const n = items.get(id); n.type === 'arrow' ? openArrowDialog(n) : n.type === 'clock' ? openClockDialog(n) : openDialog(n); }
  if (e.target.closest('.delete-btn')) softDelete(id);
});
board.addEventListener('dblclick', (e) => {
  const arrow = e.target.closest('.arrow');
  if (arrow && !e.target.closest('button, .rotate-handle, .resize-handle')) return openArrowDialog(items.get(Number(arrow.dataset.id)));
  const clock = e.target.closest('.clock');
  if (clock && !e.target.closest('button, .resize-handle')) return openClockDialog(items.get(Number(clock.dataset.id)));
  const item = e.target.closest('.note');
  if (item && e.target.closest('.note-head')) openDialog(items.get(Number(item.dataset.id)));
});
board.addEventListener('keydown', (e) => {
  const item = e.target.closest('.item');
  if (!item || e.target !== item) return;
  const id = Number(item.dataset.id), n = items.get(id);
  if (e.key === 'Enter' && n.type === 'note') openDialog(n);
  else if (e.key === 'Enter' && n.type === 'arrow') openArrowDialog(n);
  else if (e.key === 'Enter' && n.type === 'clock') openClockDialog(n);
  else if (n.type === 'arrow' && e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) { // R = 15° rechtsom, Shift+R = linksom
    n.rot = (((n.rot || 0) + (e.shiftKey ? -15 : 15)) % 360 + 360) % 360;
    paint(item, n);
    clearTimeout(n._rotTimer);
    n._rotTimer = setTimeout(() => saveArrow(n, { rot: n.rot }), 400);
  }
  else if (e.key === 'Delete') softDelete(id);
  else if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    const snapped = state.snap && n.type === 'note';
    const grid = snapped ? snapTo : (v) => v;
    const step = snapped ? (e.shiftKey ? 5 * GRID : GRID) : (e.shiftKey ? 50 : 10); // met raster: hele rasterstappen
    n.x = Math.max(0, grid(n.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)));
    n.y = Math.max(0, grid(n.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0)));
    paint(item, n);
    if (snapped) { showGrid(true); clearTimeout(showGrid.t); showGrid.t = setTimeout(() => showGrid(false), 700); }
    clearTimeout(n._saveTimer);
    n._saveTimer = setTimeout(() => saveMove(n), 400);
  }
});

function softDelete(id) {
  const n = items.get(id); if (!n) return;
  els.get(id).hidden = true;
  const commit = (keepalive = false) => {
    pendingDelete.delete(id);
    api({ action: 'delete', id }, { keepalive }).then(() => { remove(id); poll(); })
      .catch((err) => { if (els.get(id)) els.get(id).hidden = false; reportError(err); });
  };
  const timer = setTimeout(() => { hideToast(); commit(); }, UNDO_MS);
  pendingDelete.set(id, { timer, commit });
  const label = n.type === 'image' ? 'Afbeelding' : n.type === 'arrow' ? 'Pijl' : n.type === 'clock' ? 'Klok' : `"${n.title}"`;
  showToast(`${label} verwijderd`, () => {
    clearTimeout(timer); pendingDelete.delete(id); els.get(id).hidden = false;
  });
}
// Nog openstaande verwijderingen alsnog afronden bij sluiten van de pagina
addEventListener('pagehide', () => { for (const p of [...pendingDelete.values()]) { clearTimeout(p.timer); p.commit(true); } });
