import { UNDO_MS, GRID, items, els, pendingDelete, state } from './state.js';
import { snapTo, showGrid } from './snap.js';
import { board, reportError, showToast, hideToast } from './ui.js';
import { api } from './api.js';
import { paint, remove } from './render.js';
import { poll } from './sync.js';
import { saveMove, saveItem } from './drag.js';
import { TYPES, typeLabel } from './types.js';

// Bewerken / verwijderen / toetsenbord
board.addEventListener('click', (e) => {
  const item = e.target.closest('.item'); if (!item) return;
  const id = Number(item.dataset.id), n = items.get(id);
  if (e.target.closest('.edit-btn')) TYPES[n.type].edit(n);
  if (e.target.closest('.delete-btn')) softDelete(id);
});
board.addEventListener('dblclick', (e) => {
  const item = e.target.closest('.item'); if (!item) return;
  const n = items.get(Number(item.dataset.id)), dbl = TYPES[n.type]?.dbl;
  if (!dbl || e.target.closest('button, .rotate-handle, .resize-handle')) return;
  if (dbl === true || e.target.closest(dbl)) TYPES[n.type].edit(n);
});
board.addEventListener('keydown', (e) => {
  const item = e.target.closest('.item');
  if (!item || e.target !== item) return;
  const id = Number(item.dataset.id), n = items.get(id), def = TYPES[n.type];
  if (e.key === 'Enter') def.edit?.(n);
  else if (def.rotatable && e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) { // R = 15° rechtsom, Shift+R = linksom
    n.rot = (((n.rot || 0) + (e.shiftKey ? -15 : 15)) % 360 + 360) % 360;
    paint(item, n);
    clearTimeout(n._rotTimer);
    n._rotTimer = setTimeout(() => saveItem(n, { rot: n.rot }), 400);
  }
  else if (e.key === 'Delete') softDelete(id);
  else if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    const snapped = state.snap && n.type === 'note';
    const grid = snapped ? snapTo : (v) => v;
    const step = snapped ? (e.shiftKey ? 5 * GRID : GRID) : (e.shiftKey ? 50 : 10); // met raster: hele rasterstappen
    n.x = grid(n.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0));
    n.y = grid(n.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0));
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
  showToast(`${typeLabel(n)} verwijderd`, () => {
    clearTimeout(timer); pendingDelete.delete(id); els.get(id).hidden = false;
  });
}
// Nog openstaande verwijderingen alsnog afronden bij sluiten van de pagina
addEventListener('pagehide', () => { for (const p of [...pendingDelete.values()]) { clearTimeout(p.timer); p.commit(true); } });
