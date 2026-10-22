import { COLORS, items, els, state } from './state.js';
import { $, world, dialog, form } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { reveal, visibleWorld } from './zoom.js';
import { defineType } from './types.js';
import './format.js';

const swatches = $('swatches');
for (const c of COLORS) {
  const b = document.createElement('button');
  b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Kleur ' + c);
  b.addEventListener('click', () => setColor(c));
  swatches.appendChild(b);
}
function setColor(c) {
  form.color.value = c.toLowerCase();
  for (const b of swatches.children) b.setAttribute('aria-pressed', String(b.title.toLowerCase() === c.toLowerCase()));
}
form.color.addEventListener('input', () => setColor(form.color.value));

// Inhoud van de notitie zoals die bij het openen was; de server vergelijkt daarmee om overschrijven te voorkomen.
let editBase = null;
let forceSave = false;

export function openDialog(n) {
  form.reset();
  $('formError').hidden = true;
  $('dialogTitle').textContent = n ? 'Notitie bewerken' : 'Nieuwe notitie';
  form.id.value = n ? n.id : '';
  form.title.value = n ? n.title : '';
  form.body.value = n ? n.body : '';
  editBase = n ? { title: n.title, body: n.body, color: n.color } : null;
  forceSave = false;
  setColor(n ? n.color : COLORS[0]);
  dialog.showModal();
  form.title.focus();
}
$('cancelBtn').addEventListener('click', () => dialog.close());
// De dialoog sluit via Annuleren, Opslaan of Escape; niet door buiten het venster te klikken (dat gaf verloren invoer).

// Eerste vrije plek voor een item van w x h: vertrekpunt is het midden van het zichtbare deel van het bord, en vandaar zoeken we in
// steeds grotere kringen (op het 20 px-raster) naar de dichtstbijzijnde plek die geen bestaand item raakt. `top` is de ruimte die
// boven het item vrij moet blijven (bijvoorbeeld voor het rotatiegreepje). Geeft de linkerbovenhoek terug.
const SPOT_GAP = 20, SPOT_STEP = 20, SPOT_MAX_RADIUS = 20000;
export function freeSpot(w = 262, h = 140, top = SPOT_GAP) {
  const rects = [];
  for (const n of items.values()) {
    const el = els.get(n.id);
    if (!el || el.hidden) continue; // verborgen (net verwijderd) telt niet mee
    if (n.type === 'shape' || n.type === 'wordart') { // omhullende van het geroteerde item
      const a = (n.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const bw = n.w * c + n.h * s, bh = n.w * s + n.h * c, cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      rects.push([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2]);
      continue;
    }
    let iw = n.w, ih = n.h;
    if (n.type === 'note') { // een notitie groeit mee met zijn tekst: meet de echte hoogte (in bordcoördinaten)
      const r = el.getBoundingClientRect();
      iw = 262; ih = r.height / state.zoom || 140;
    }
    rects.push([n.x, n.y, n.x + iw, n.y + ih]);
  }
  const free = (x, y) => !rects.some(([l, t, r, b]) => x < r + SPOT_GAP && x + w > l - SPOT_GAP && y - top < b + SPOT_GAP && y + h > t - SPOT_GAP);
  const v = visibleWorld(), cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
  const snap = (v) => Math.round(v / SPOT_STEP) * SPOT_STEP;
  const at = (dx, dy) => ({ x: snap(cx + dx - w / 2), y: snap(cy + dy - h / 2) }); // het item komt met zijn midden op (cx + dx, cy + dy)
  const first = at(0, 0);
  if (free(first.x, first.y)) return first;
  for (let r = SPOT_STEP; r <= SPOT_MAX_RADIUS; r += SPOT_STEP) {
    const n = Math.max(8, Math.round(2 * Math.PI * r / SPOT_STEP)); // een punt per rasterstap langs de kring
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * i / n; // vanaf boven, met de klok mee
      const p = at(Math.cos(a) * r, Math.sin(a) * r), key = p.x + ',' + p.y;
      if (seen.has(key)) continue;
      seen.add(key);
      if (free(p.x, p.y)) return p;
    }
  }
  return first;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = form.id.value ? Number(form.id.value) : null;
  const payload = { action: id ? 'update' : 'create', id, title: form.title.value, body: form.body.value, color: form.color.value };
  if (!id) Object.assign(payload, freeSpot());
  else if (editBase) Object.assign(payload, { base: editBase, force: forceSave });
  try {
    const { note } = await api(payload);
    upsert(note);
    world.appendChild(els.get(note.id));
    dialog.close();
    if (!id) reveal(els.get(note.id));
    poll();
  } catch (err) {
    if (err.status === 409) forceSave = true; // bij nogmaals opslaan bewust overschrijven
    const box = $('formError'); box.textContent = err.message; box.hidden = false;
  }
});

defineType('note', { label: (n) => `"${n.title}"`, edit: openDialog, dbl: '.note-head' });
