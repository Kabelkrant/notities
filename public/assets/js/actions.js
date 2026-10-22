import { UNDO_MS, GRID, TRASH, items, els, pendingDelete, hiddenIds, selected, state } from './state.js';
import { snapTo, showGrid } from './snap.js';
import { board, reportError, showToast, hideToast } from './ui.js';
import { api } from './api.js';
import { paint, remove, upsert, notifyChanged } from './render.js';
import { poll } from './sync.js';
import { saveMove, saveItem } from './drag.js';
import { deselect } from './selection.js';
import { TYPES, typeLabel } from './types.js';

// Bewerken / verwijderen / toetsenbord
board.addEventListener('click', (e) => {
  const item = e.target.closest('.item'); if (!item) return;
  const id = Number(item.dataset.id), n = items.get(id);
  if (e.target.closest('.edit-btn')) TYPES[n.type].edit(n);
  if (e.target.closest('.delete-btn')) softDelete([id]);
});
board.addEventListener('dblclick', (e) => {
  const item = e.target.closest('.item'); if (!item) return;
  const n = items.get(Number(item.dataset.id)), dbl = TYPES[n.type]?.dbl;
  if (!dbl || e.target.closest('button, .rotate-handle, .resize-handle')) return;
  if (dbl === true || e.target.closest(dbl)) TYPES[n.type].edit(n);
});
// Pijltjes en Delete gelden voor de hele selectie als het gefocuste (of, zonder focus, het eerste geselecteerde) item daarin zit
const groupOf = (id) => selected.has(id) ? [...selected].filter((i) => els.has(i) && !els.get(i).hidden) : [id];
function moveKey(e, id) {
  const lead = items.get(id);
  const snapped = state.snap && lead.type === 'note';
  const grid = snapped ? snapTo : (v) => v;
  const step = snapped ? (e.shiftKey ? 5 * GRID : GRID) : (e.shiftKey ? 50 : 10); // met raster: hele rasterstappen
  const dx = grid(lead.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)) - lead.x;
  const dy = grid(lead.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0)) - lead.y;
  for (const i of groupOf(id)) { // de hele groep schuift even ver, zodat de onderlinge afstanden gelijk blijven
    const n = items.get(i);
    n.x += dx; n.y += dy;
    paint(els.get(i), n);
    clearTimeout(n._saveTimer);
    n._saveTimer = setTimeout(() => saveMove(n), 400);
  }
  if (snapped) { showGrid(true); clearTimeout(showGrid.t); showGrid.t = setTimeout(() => showGrid(false), 700); }
}
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
  else if (e.key === 'Delete') softDelete(groupOf(id));
  else if (e.key.startsWith('Arrow')) { e.preventDefault(); moveKey(e, id); }
});
// Een selectie met Ctrl+klik geeft geen focus; de toetsen werken dan toch op de selectie
addEventListener('keydown', (e) => {
  if (state.mode === 'notes' || !selected.size || e.target.closest?.('.item, input, textarea, select, button, [contenteditable]') || document.querySelector('dialog[open]')) return;
  const ids = groupOf([...selected][0]);
  if (e.key === 'Delete') softDelete(ids);
  else if (e.key.startsWith('Arrow')) { e.preventDefault(); moveKey(e, ids[0]); }
});

// Weggooien met ongedaan maken. Notities gaan eerst naar de Prullenbak (meteen van het canvas af); uit de Prullenbak, en andere items
// (afbeelding, vorm, klok, ...), worden ze na 6 seconden definitief verwijderd. Meerdere items vormen één melding en één Ongedaan maken.
export function softDelete(ids) {
  ids = ids.filter((id) => items.has(id));
  if (!ids.length) return;
  deselect(ids);
  const toTrash = ids.filter((id) => { const n = items.get(id); return n.type === 'note' && n.folder !== TRASH; });
  const perm = ids.filter((id) => !toTrash.includes(id));
  const prev = new Map(toTrash.map((id) => [id, items.get(id).folder]));
  const label = (id) => typeLabel(items.get(id));
  const fromTrash = perm.length > 0 && perm.every((id) => items.get(id).type === 'note'); // alleen notities uit de Prullenbak
  const text = !perm.length
    ? (toTrash.length > 1 ? `${toTrash.length} notities naar de prullenbak verplaatst` : `${label(toTrash[0])} naar de prullenbak verplaatst`)
    : !toTrash.length
      ? (perm.length > 1 ? `${perm.length} ${fromTrash ? 'notities' : 'items'} ${fromTrash ? 'definitief ' : ''}verwijderd` : `${label(perm[0])} ${fromTrash ? 'definitief ' : ''}verwijderd`)
      : `${ids.length} items verwijderd (${toTrash.length} naar de prullenbak)`;

  // Naar de Prullenbak (of terug): lokaal meteen, daarna de server; bij een fout terugdraaien
  const move = async (id, folder) => {
    const n = items.get(id); if (!n) return;
    const was = n.folder;
    n.folder = folder; upsert(n);
    try { const { note } = await api({ action: 'note_folder', id, folder }); upsert(note); poll(); }
    catch (err) { n.folder = was; upsert(n); reportError(err); }
  };
  for (const id of toTrash) move(id, TRASH);

  // Definitief verwijderen, met 6 seconden bedenktijd
  for (const id of perm) { hiddenIds.add(id); if (els.get(id)) els.get(id).hidden = true; }
  notifyChanged();
  let done = false;
  const commit = (keepalive = false) => {
    if (done) return;
    done = true;
    for (const id of perm) {
      pendingDelete.delete(id);
      api({ action: 'delete', id }, { keepalive }).then(() => { remove(id); poll(); })
        .catch((err) => { hiddenIds.delete(id); if (els.get(id)) els.get(id).hidden = false; notifyChanged(); reportError(err); });
    }
  };
  const timer = perm.length ? setTimeout(() => { hideToast(); commit(); }, UNDO_MS) : 0;
  for (const id of perm) pendingDelete.set(id, { timer, commit });
  showToast(text, () => {
    clearTimeout(timer); done = true;
    for (const id of perm) { pendingDelete.delete(id); hiddenIds.delete(id); if (els.get(id)) els.get(id).hidden = false; }
    for (const id of toTrash) move(id, prev.get(id));
    notifyChanged();
  });
}
// Nog openstaande verwijderingen alsnog afronden bij sluiten van de pagina
addEventListener('pagehide', () => { for (const p of [...pendingDelete.values()]) { clearTimeout(p.timer); p.commit(true); } });
