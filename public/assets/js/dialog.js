import { COLORS, items, els } from './state.js';
import { $, board, dialog, form } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
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

export function freeSpot() {
  const W = 282, H = 200, cols = Math.max(1, Math.floor((board.clientWidth - 20) / W));
  const taken = [...items.values()];
  for (let i = 0; i < 500; i++) {
    const x = 20 + (i % cols) * W, y = 20 + Math.floor(i / cols) * H;
    if (!taken.some((n) => Math.abs(n.x - x) < W - 20 && Math.abs(n.y - y) < H - 40)) return { x, y };
  }
  return { x: 20, y: 20 };
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
    board.appendChild(els.get(note.id));
    dialog.close();
    if (!id) els.get(note.id).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    poll();
  } catch (err) {
    if (err.status === 409) forceSave = true; // bij nogmaals opslaan bewust overschrijven
    const box = $('formError'); box.textContent = err.message; box.hidden = false;
  }
});
