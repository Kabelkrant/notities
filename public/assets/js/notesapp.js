import { COLORS, items, els, state } from './state.js';
import { $ } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { freeSpot } from './dialog.js';
import { softDelete } from './actions.js';
import { needsLightText } from './color.js';
import { setupEditor } from './format.js';

// Notitie-app: links de lijst met notities (1/3), rechts de editor (2/3), zoals een e-mailprogramma.
// De volgorde ('order') hoort alleen bij deze lijst; positie en stapelvolgorde op het canvas blijven er los van.
const app = $('notesApp'), list = $('naList'), editorBox = $('naEditor'), empty = $('naEmpty');
const titleInput = $('naTitle'), swatchBox = $('naSwatches'), savedEl = $('naSaved'), conflictBox = $('naConflict');
const SAVE_DELAY = 700;

// De Markdown-editor is dezelfde als in het notitievenster op het canvas: de opmaakbalk wordt gekopieerd en opnieuw aangesloten
const srcField = $('bodyField').closest('.field');
const field = srcField.cloneNode(true);
field.querySelector('.field-label')?.remove();
field.querySelector('.emoji-pop').innerHTML = '';
field.querySelector('.fmt-bar').removeAttribute('aria-controls');
const body = field.querySelector('textarea');
for (const a of ['id', 'name', 'required']) body.removeAttribute(a);
body.setAttribute('aria-label', 'Inhoud van de notitie');
$('naBodyField').appendChild(field);
setupEditor(field, body, null);

let activeId = null, dirty = false, saving = false, saveTimer = 0, base = null, color = COLORS[0], conflict = false;

const visibleNotes = () => [...items.values()].filter((n) => n.type === 'note' && !els.get(n.id)?.hidden).sort((a, b) => a.order - b.order || b.id - a.id);

/* ---------- Lijst ---------- */
function itemEl(id) { return list.querySelector(`.na-item[data-id="${id}"]`); }

function buildItem(n) {
  const el = document.createElement('div');
  el.className = 'na-item'; el.dataset.id = n.id; el.tabIndex = 0; el.setAttribute('role', 'option');
  el.innerHTML = '<span class="na-grip" aria-hidden="true" title="Sleep om de volgorde te wijzigen">⋮⋮</span><span class="na-title"></span>';
  return el;
}

function renderList() {
  if (drag?.moved) return; // niet midden in het slepen
  const notes = visibleNotes(), keep = new Map([...list.querySelectorAll('.na-item')].map((e) => [Number(e.dataset.id), e]));
  notes.forEach((n, i) => {
    let el = keep.get(n.id);
    keep.delete(n.id);
    if (!el) el = buildItem(n);
    el.style.background = n.color;
    el.classList.toggle('on-dark', needsLightText(n.color));
    el.querySelector('.na-title').textContent = n.title;
    el.classList.toggle('active', n.id === activeId);
    el.setAttribute('aria-selected', String(n.id === activeId));
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
  });
  for (const el of keep.values()) el.remove();
  if (activeId === null && notes.length && !matchMedia('(max-width: 720px)').matches) select(notes[0].id); // desktop: meteen de eerste notitie openen
}

/* ---------- Editor ---------- */
const snapshot = () => ({ title: titleInput.value, body: body.value, color });

function setSaved(text) { savedEl.textContent = text; }

function fill(n) {
  titleInput.value = n.title;
  body.value = n.body;
  color = n.color;
  base = { title: n.title, body: n.body, color: n.color };
  for (const b of swatchBox.children) b.setAttribute('aria-pressed', String(b.title.toLowerCase() === color.toLowerCase()));
}

async function select(id, { focus = false } = {}) {
  if (id === activeId) { app.classList.add('na-open'); return; }
  await flush();
  const n = items.get(id);
  if (!n) return;
  activeId = id; dirty = false; conflict = false;
  conflictBox.hidden = true;
  fill(n);
  setSaved('');
  editorBox.hidden = false; empty.hidden = true;
  app.classList.add('na-open'); // smal scherm: toon de editor in plaats van de lijst
  for (const el of list.children) { const on = Number(el.dataset.id) === id; el.classList.toggle('active', on); el.setAttribute('aria-selected', String(on)); }
  itemEl(id)?.scrollIntoView({ block: 'nearest' });
  if (focus) { titleInput.focus(); titleInput.select(); }
}

function showNone() {
  activeId = null; dirty = false; base = null;
  editorBox.hidden = true; empty.hidden = false;
  app.classList.remove('na-open');
}

function touch() {
  dirty = true;
  setSaved('Wijzigingen worden opgeslagen…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY);
}

async function save(force = false) {
  clearTimeout(saveTimer);
  if (!dirty || saving || activeId === null || (conflict && !force)) return;
  const id = activeId, sent = snapshot();
  saving = true;
  try {
    const { note } = await api({ action: 'update', id, title: sent.title.trim() || 'Naamloos', body: sent.body, color: sent.color, base, force });
    upsert(note);
    if (id === activeId) {
      base = { title: note.title, body: note.body, color: note.color };
      const cur = snapshot();
      dirty = cur.title !== sent.title || cur.body !== sent.body || cur.color !== sent.color; // intussen verder getypt: nog een ronde
      conflict = false; conflictBox.hidden = true;
      setSaved(dirty ? 'Wijzigingen worden opgeslagen…' : 'Opgeslagen');
    }
    poll();
  } catch (err) {
    if (err.status === 409) { conflict = true; conflictBox.hidden = false; setSaved(''); }
    else setSaved('Opslaan mislukt: ' + err.message);
  } finally {
    saving = false;
    if (dirty && !conflict && id === activeId && !saveTimer) saveTimer = setTimeout(save, SAVE_DELAY);
  }
}

async function flush() { // wijzigingen nu opslaan (bij wisselen van notitie of modus)
  clearTimeout(saveTimer); saveTimer = 0;
  if (dirty && !conflict) { while (saving) await new Promise((r) => setTimeout(r, 30)); await save(); }
}

titleInput.addEventListener('input', touch);
body.addEventListener('input', touch);
body.addEventListener('blur', () => { if (dirty) save(); });
titleInput.addEventListener('blur', () => { if (dirty) save(); });
for (const c of COLORS) {
  const b = document.createElement('button');
  b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Kleur ' + c);
  b.addEventListener('click', () => { color = c; for (const s of swatchBox.children) s.setAttribute('aria-pressed', String(s === b)); touch(); });
  swatchBox.appendChild(b);
}
$('naKeepMine').addEventListener('click', () => { conflict = false; conflictBox.hidden = true; save(true); });
$('naTakeTheirs').addEventListener('click', () => { dirty = false; conflict = false; conflictBox.hidden = true; state.version = ''; poll(); });
$('naBack').addEventListener('click', async () => { await flush(); app.classList.remove('na-open'); });
$('naDelete').addEventListener('click', async () => {
  if (activeId === null) return;
  const id = activeId, notes = visibleNotes(), i = notes.findIndex((n) => n.id === id), next = notes[i + 1] || notes[i - 1];
  clearTimeout(saveTimer); dirty = false;
  softDelete([id]); // met melding en Ongedaan maken, zoals op het canvas
  renderList();
  if (next) select(next.id); else showNone();
});

/* ---------- Nieuwe notitie: ook op het canvas, met dezelfde automatische plaatsing ---------- */
$('naNew').addEventListener('click', async () => {
  await flush();
  try {
    const { x, y } = freeSpot();
    const { note } = await api({ action: 'create', title: 'Nieuwe notitie', body: '', color: COLORS[0], x, y });
    upsert(note);
    renderList();
    await select(note.id, { focus: true });
    poll();
  } catch (err) { setSaved('Aanmaken mislukt: ' + err.message); }
});

/* ---------- Wijzigingen van buiten (synchronisatie, canvas, verwijderen) ---------- */
let queued = false;
window.addEventListener('notes:changed', () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderList();
    if (activeId === null) return;
    const n = items.get(activeId);
    if (!n || els.get(activeId)?.hidden) { const notes = visibleNotes(); notes.length ? select(notes[0].id) : showNone(); return; }
    if (!dirty && !saving && base && (n.title !== base.title || n.body !== base.body || n.color !== base.color)) { // door iemand anders gewijzigd
      const s = body.selectionStart, e = body.selectionEnd;
      fill(n);
      body.setSelectionRange(Math.min(s, body.value.length), Math.min(e, body.value.length));
    }
  });
});
window.addEventListener('mode:leaving', () => { flush(); });
window.addEventListener('mode:changed', () => { renderList(); });
window.addEventListener('pagehide', () => { if (dirty) save(); });

/* ---------- Lijst: kiezen, toetsen en slepen om de volgorde te wijzigen ---------- */
let drag = null, suppressClick = false;
list.addEventListener('click', (e) => {
  const el = e.target.closest('.na-item');
  if (!el) return;
  if (suppressClick) { suppressClick = false; return; }
  select(Number(el.dataset.id));
});

async function saveOrder() {
  const ids = [...list.querySelectorAll('.na-item')].map((e) => Number(e.dataset.id));
  ids.forEach((id, i) => { const n = items.get(id); if (n) n.order = i; });
  try { await api({ action: 'reorder', ids }); poll(); }
  catch (err) { setSaved('Volgorde opslaan mislukt: ' + err.message); }
}

list.addEventListener('keydown', (e) => {
  const el = e.target.closest('.na-item');
  if (!el) return;
  const all = [...list.querySelectorAll('.na-item')], i = all.indexOf(el);
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(Number(el.dataset.id), { focus: true }); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const j = i + (e.key === 'ArrowDown' ? 1 : -1);
    if (j < 0 || j >= all.length) return;
    if (e.altKey) { list.insertBefore(el, e.key === 'ArrowDown' ? all[j].nextSibling : all[j]); el.focus(); saveOrder(); } // Alt+pijl: omhoog of omlaag verplaatsen
    else all[j].focus();
  }
});

const dropLine = document.createElement('div');
dropLine.className = 'na-drop-line';
function placeLine(others, idx) {
  const last = others[others.length - 1];
  dropLine.style.top = (idx < others.length ? others[idx].offsetTop - 5 : last.offsetTop + last.offsetHeight + 3) + 'px';
}

list.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.na-item');
  if (!el || e.button !== 0) return;
  if (e.pointerType === 'touch' && !e.target.closest('.na-grip')) return; // met een vinger scrolt de lijst; alleen aan het greepje sleep je
  drag = { el, id: Number(el.dataset.id), pid: e.pointerId, x: e.clientX, y: e.clientY, scroll0: list.scrollTop, moved: false, idx: 0, others: [] };
});
list.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.moved = true;
    list.setPointerCapture(e.pointerId);
    drag.el.classList.add('dragging');
    list.classList.add('reordering');
    list.appendChild(dropLine);
  }
  const rect = list.getBoundingClientRect();
  if (e.clientY < rect.top + 36) list.scrollTop -= 14; else if (e.clientY > rect.bottom - 36) list.scrollTop += 14; // automatisch scrollen aan de randen
  drag.el.style.transform = `translateY(${e.clientY - drag.y + (list.scrollTop - drag.scroll0)}px)`;
  drag.others = [...list.querySelectorAll('.na-item')].filter((o) => o !== drag.el);
  const idx = drag.others.findIndex((o) => { const r = o.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  drag.idx = idx < 0 ? drag.others.length : idx;
  if (drag.others.length) placeLine(drag.others, drag.idx);
});
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag; drag = null;
  if (!d.moved) return;
  d.el.classList.remove('dragging'); d.el.style.transform = '';
  list.classList.remove('reordering'); dropLine.remove();
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  if (cancel) return;
  list.insertBefore(d.el, d.others[d.idx] || null);
  saveOrder();
}
list.addEventListener('pointerup', (e) => endDrag(e, false));
list.addEventListener('pointercancel', (e) => endDrag(e, true));

renderList();
