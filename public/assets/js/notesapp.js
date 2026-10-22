import { COLORS, items, els, state } from './state.js';
import { $ } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { freeSpot } from './dialog.js';
import { softDelete } from './actions.js';
import { needsLightText } from './color.js';
import { setupEditor } from './format.js';

// Notitie-app: links een boomstructuur van mappen met notities (1/3), rechts de editor (2/3), zoals een e-mailprogramma.
// Mappen staan op het bovenste niveau, notities altijd daaronder (geen geneste mappen). Notities zonder map staan in '(niet ingedeeld)' (map 0).
// Volgorde en indeling horen alleen bij deze weergave; positie en stapelvolgorde op het canvas blijven er los van.
const app = $('notesApp'), list = $('naList'), editorBox = $('naEditor'), empty = $('naEmpty');
const titleInput = $('naTitle'), swatchBox = $('naSwatches'), savedEl = $('naSaved'), conflictBox = $('naConflict'), folderSelect = $('naFolder');
const SAVE_DELAY = 700, GENERAL = 0;

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

// Ingeklapte mappen onthouden we per browser
let collapsed = new Set();
try { collapsed = new Set(JSON.parse(localStorage.getItem('na-collapsed') || '[]')); } catch { /* geen opslag beschikbaar */ }
const saveCollapsed = () => { try { localStorage.setItem('na-collapsed', JSON.stringify([...collapsed])); } catch { /* geen opslag */ } };

const folderIds = () => state.folders.map((f) => f.id);
const folderOf = (n) => folderIds().includes(n.folder) ? n.folder : GENERAL; // een onbekende map telt als (niet ingedeeld)
const visibleNotes = () => [...items.values()].filter((n) => n.type === 'note' && !els.get(n.id)?.hidden).sort((a, b) => a.order - b.order || b.id - a.id);
const section = (fid) => list.querySelector(`.na-folder[data-folder="${fid}"]`);
const itemEl = (id) => list.querySelector(`.na-item[data-id="${id}"]`);
const sections = () => [...list.querySelectorAll('.na-folder')];
const itemsOf = (sec) => [...sec.querySelectorAll('.na-item')];

/* ---------- Boom ---------- */
function buildFolder(f) {
  const sec = document.createElement('section');
  sec.className = 'na-folder'; sec.dataset.folder = f.id;
  sec.innerHTML = `<div class="na-fhead" tabindex="0" role="treeitem">
      <span class="na-grip" aria-hidden="true" title="Sleep om de map te verplaatsen">⋮⋮</span>
      <span class="na-ficon" aria-hidden="true">📂</span><span class="na-fname"></span><span class="na-fcount"></span>
      <span class="na-factions"><button type="button" class="na-fedit" title="Naam wijzigen" aria-label="Naam wijzigen">✏️</button><button type="button" class="na-fdel" title="Map verwijderen" aria-label="Map verwijderen">🗑️</button></span>
    </div><div class="na-fnotes" role="group"></div>`;
  if (f.id === GENERAL) sec.querySelector('.na-factions').hidden = true; // (niet ingedeeld) blijft altijd bestaan
  return sec;
}

function buildItem(n) {
  const el = document.createElement('div');
  el.className = 'na-item'; el.dataset.id = n.id; el.tabIndex = 0; el.setAttribute('role', 'treeitem');
  el.innerHTML = '<span class="na-grip" aria-hidden="true" title="Sleep om de volgorde te wijzigen">⋮⋮</span><span class="na-title"></span>';
  return el;
}

function renderList() {
  if (drag?.moved) return; // niet midden in het slepen
  const notes = visibleNotes(), byFolder = new Map(state.folders.map((f) => [f.id, []]));
  for (const n of notes) byFolder.get(folderOf(n)).push(n);
  const keepSec = new Map(sections().map((s) => [Number(s.dataset.folder), s]));
  const keepItems = new Map([...list.querySelectorAll('.na-item')].map((e) => [Number(e.dataset.id), e]));
  state.folders.forEach((f, i) => {
    let sec = keepSec.get(f.id);
    keepSec.delete(f.id);
    if (!sec) sec = buildFolder(f);
    if (list.children[i] !== sec) list.insertBefore(sec, list.children[i] || null);
    const isCollapsed = collapsed.has(f.id), head = sec.querySelector('.na-fhead');
    sec.classList.toggle('collapsed', isCollapsed);
    head.setAttribute('aria-expanded', String(!isCollapsed));
    sec.querySelector('.na-ficon').textContent = isCollapsed ? '📁' : '📂'; // dichte of geopende map
    if (!sec.querySelector('.na-rename')) sec.querySelector('.na-fname').textContent = f.name;
    sec.querySelector('.na-fcount').textContent = byFolder.get(f.id).length;
    const box = sec.querySelector('.na-fnotes');
    byFolder.get(f.id).forEach((n, j) => {
      let el = keepItems.get(n.id);
      keepItems.delete(n.id);
      if (!el) el = buildItem(n);
      el.style.background = n.color;
      el.classList.toggle('on-dark', needsLightText(n.color));
      el.querySelector('.na-title').textContent = n.title;
      el.classList.toggle('active', n.id === activeId);
      el.setAttribute('aria-selected', String(n.id === activeId));
      if (box.children[j] !== el) box.insertBefore(el, box.children[j] || null);
    });
  });
  for (const el of keepItems.values()) el.remove();
  for (const s of keepSec.values()) s.remove();
  renderFolderSelect();
  const first = list.querySelector('.na-item');
  if (activeId === null && first && !matchMedia('(max-width: 720px)').matches) select(Number(first.dataset.id)); // desktop: meteen de eerste notitie openen
}

function renderFolderSelect() {
  const want = state.folders.map((f) => f.id + '|' + f.name).join('\n');
  if (folderSelect._sig !== want) {
    folderSelect._sig = want;
    folderSelect.replaceChildren(...state.folders.map((f) => Object.assign(document.createElement('option'), { value: f.id, textContent: f.name })));
  }
  const n = items.get(activeId);
  if (n) folderSelect.value = String(folderOf(n));
}

/* ---------- Editor ---------- */
const snapshot = () => ({ title: titleInput.value, body: body.value, color });
function setSaved(text) { savedEl.textContent = text; }

// De kleur van de notitie voor het tekstvak (de menging met wit of zwart, en de tekstkleur, regelt de CSS per thema)
function tint() { editorBox.style.setProperty('--na-color', color); }

function fill(n) {
  titleInput.value = n.title;
  body.value = n.body;
  color = n.color;
  base = { title: n.title, body: n.body, color: n.color };
  for (const b of swatchBox.children) b.setAttribute('aria-pressed', String(b.title.toLowerCase() === color.toLowerCase()));
  tint();
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
  if (collapsed.delete(folderOf(n))) { saveCollapsed(); renderList(); } // de map van de gekozen notitie klapt open
  renderFolderSelect();
  for (const el of list.querySelectorAll('.na-item')) { const on = Number(el.dataset.id) === id; el.classList.toggle('active', on); el.setAttribute('aria-selected', String(on)); }
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
  b.addEventListener('click', () => { color = c; tint(); for (const s of swatchBox.children) s.setAttribute('aria-pressed', String(s === b)); touch(); });
  swatchBox.appendChild(b);
}
$('naKeepMine').addEventListener('click', () => { conflict = false; conflictBox.hidden = true; save(true); });
$('naTakeTheirs').addEventListener('click', () => { dirty = false; conflict = false; conflictBox.hidden = true; state.version = ''; poll(); });
$('naBack').addEventListener('click', async () => { await flush(); app.classList.remove('na-open'); });
$('naDelete').addEventListener('click', async () => {
  if (activeId === null) return;
  const id = activeId, order = [...list.querySelectorAll('.na-item')].map((e) => Number(e.dataset.id)), i = order.indexOf(id), next = order[i + 1] ?? order[i - 1];
  clearTimeout(saveTimer); dirty = false;
  softDelete([id]); // met melding en Ongedaan maken, zoals op het canvas
  renderList();
  if (next !== undefined) select(next); else showNone();
});
folderSelect.addEventListener('change', async () => { // map van de notitie wijzigen (ook handig op touch, waar slepen lastig is)
  if (activeId === null) return;
  const id = activeId;
  try {
    await flush();
    const { note } = await api({ action: 'note_folder', id, folder: Number(folderSelect.value) });
    upsert(note); renderList(); itemEl(id)?.scrollIntoView({ block: 'nearest' }); poll();
  } catch (err) { setSaved('Verplaatsen mislukt: ' + err.message); renderFolderSelect(); }
});

/* ---------- Nieuwe notitie: ook op het canvas, met dezelfde automatische plaatsing ---------- */
$('naNew').addEventListener('click', async () => {
  await flush();
  try {
    const { x, y } = freeSpot();
    const cur = items.get(activeId), folder = cur ? folderOf(cur) : GENERAL; // in de map van de geopende notitie
    const { note } = await api({ action: 'create', title: 'Nieuwe notitie', body: '', color: COLORS[0], x, y, folder });
    upsert(note);
    collapsed.delete(folder); saveCollapsed();
    renderList();
    await select(note.id, { focus: true });
    poll();
  } catch (err) { setSaved('Aanmaken mislukt: ' + err.message); }
});

/* ---------- Mappen: maken, hernoemen, verwijderen, in- en uitklappen ---------- */
$('naNewFolder').addEventListener('click', async () => {
  try {
    const { folder, folders } = await api({ action: 'folder_create', name: 'Nieuwe map' });
    state.folders = folders; renderList();
    const sec = section(folder.id);
    sec?.scrollIntoView({ block: 'nearest' });
    if (sec) startRename(sec);
  } catch (err) { setSaved('Map maken mislukt: ' + err.message); }
});

function startRename(sec) {
  const fid = Number(sec.dataset.folder);
  if (fid === GENERAL || sec.querySelector('.na-rename')) return;
  const nameEl = sec.querySelector('.na-fname'), old = state.folders.find((f) => f.id === fid)?.name ?? '';
  const input = Object.assign(document.createElement('input'), { type: 'text', className: 'na-rename', value: old, maxLength: 60 });
  input.setAttribute('aria-label', 'Naam van de map');
  nameEl.textContent = ''; nameEl.appendChild(input);
  input.focus(); input.select();
  let done = false;
  const finish = async (commit) => {
    if (done) return; done = true;
    const name = input.value.trim();
    input.remove(); nameEl.textContent = old;
    if (commit && name && name !== old) {
      try { const { folders } = await api({ action: 'folder_rename', id: fid, name }); state.folders = folders; poll(); }
      catch (err) { setSaved('Hernoemen mislukt: ' + err.message); }
    }
    renderList();
  };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
}

async function deleteFolder(btn, sec) {
  const fid = Number(sec.dataset.folder);
  if (!btn.classList.contains('confirm')) { // eerst bevestigen: een tweede klik verwijdert (de notities verhuizen naar (niet ingedeeld))
    btn.classList.add('confirm'); btn.textContent = 'Zeker?';
    setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = '🗑️'; }, 3000);
    return;
  }
  try { const { folders } = await api({ action: 'folder_delete', id: fid }); state.folders = folders; collapsed.delete(fid); saveCollapsed(); renderList(); poll(); }
  catch (err) { setSaved('Verwijderen mislukt: ' + err.message); }
}

function toggleFolder(sec) {
  const fid = Number(sec.dataset.folder);
  collapsed.has(fid) ? collapsed.delete(fid) : collapsed.add(fid);
  saveCollapsed(); renderList();
}

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
    if (!n || els.get(activeId)?.hidden) { const first = list.querySelector('.na-item'); first ? select(Number(first.dataset.id)) : showNone(); return; }
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

/* ---------- Indeling bewaren ---------- */
async function saveLayout() {
  const secs = sections(), ids = secs.map((s) => Number(s.dataset.folder)), notes = [];
  for (const s of secs) for (const el of itemsOf(s)) notes.push([Number(el.dataset.id), Number(s.dataset.folder)]);
  state.folders = ids.map((id) => state.folders.find((f) => f.id === id)).filter(Boolean); // lokaal alvast bijwerken
  notes.forEach(([id, fid], i) => { const n = items.get(id); if (n) { n.order = i; n.folder = fid; } });
  renderFolderSelect();
  try { await api({ action: 'organize', folders: ids, notes }); poll(); }
  catch (err) { setSaved('Indeling opslaan mislukt: ' + err.message); }
}

/* ---------- Lijst: klikken, toetsen en slepen ---------- */
let drag = null, suppressClick = false;
list.addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const sec = e.target.closest('.na-folder');
  if (!sec) return;
  if (e.target.closest('.na-fedit')) return startRename(sec);
  if (e.target.closest('.na-fdel')) return deleteFolder(e.target.closest('.na-fdel'), sec);
  if (e.target.closest('.na-rename')) return;
  const item = e.target.closest('.na-item');
  if (item) return select(Number(item.dataset.id));
  if (e.target.closest('.na-fhead')) toggleFolder(sec);
});
list.addEventListener('dblclick', (e) => { const n = e.target.closest('.na-fname'); if (n) startRename(n.closest('.na-folder')); });

list.addEventListener('keydown', (e) => {
  const item = e.target.closest('.na-item'), head = e.target.closest('.na-fhead');
  if (e.target.closest('.na-rename')) return;
  const rows = [...list.querySelectorAll('.na-fhead, .na-folder:not(.collapsed) .na-item')], i = rows.indexOf(item || head);
  if (i < 0) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (item) select(Number(item.dataset.id), { focus: true }); else toggleFolder(head.closest('.na-folder'));
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    if (e.altKey) { // Alt+pijl: verplaatsen
      if (item) moveNote(item, dir); else moveFolder(head.closest('.na-folder'), dir);
    } else rows[i + dir]?.focus();
  } else if (head && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const sec = head.closest('.na-folder');
    if (collapsed.has(Number(sec.dataset.folder)) === (e.key === 'ArrowRight')) toggleFolder(sec);
  } else if (head && e.key === 'F2') startRename(head.closest('.na-folder'));
});

function moveNote(el, dir) { // binnen de map; aan de rand door naar de naastgelegen map
  const sec = el.closest('.na-folder'), sibs = itemsOf(sec), i = sibs.indexOf(el), all = sections(), s = all.indexOf(sec);
  if (dir > 0 && sibs[i + 1]) sibs[i + 1].after(el);
  else if (dir < 0 && sibs[i - 1]) sibs[i - 1].before(el);
  else if (dir > 0 && all[s + 1]) all[s + 1].querySelector('.na-fnotes').prepend(el);
  else if (dir < 0 && all[s - 1]) all[s - 1].querySelector('.na-fnotes').append(el);
  else return;
  const to = el.closest('.na-folder');
  if (collapsed.delete(Number(to.dataset.folder))) { saveCollapsed(); to.classList.remove('collapsed'); }
  el.focus(); saveLayout();
}
function moveFolder(sec, dir) {
  const all = sections(), i = all.indexOf(sec), other = all[i + dir];
  if (!other) return;
  dir > 0 ? other.after(sec) : other.before(sec);
  sec.querySelector('.na-fhead').focus(); saveLayout();
}

const dropLine = document.createElement('div');
dropLine.className = 'na-drop-line';
function placeLine(clientY) { // lijn op schermhoogte clientY, omgerekend naar de (scrollende) lijst
  dropLine.style.top = (clientY - list.getBoundingClientRect().top + list.scrollTop) + 'px';
}

list.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, input')) return;
  const item = e.target.closest('.na-item'), head = e.target.closest('.na-fhead');
  const el = item || head?.closest('.na-folder');
  if (!el) return;
  if (e.pointerType === 'touch' && !e.target.closest('.na-grip')) return; // met een vinger scrolt de lijst; alleen aan het greepje sleep je
  drag = { kind: item ? 'note' : 'folder', el, pid: e.pointerId, x: e.clientX, y: e.clientY, scroll0: list.scrollTop, moved: false, target: null };
});
list.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.moved = true;
    list.setPointerCapture(e.pointerId);
    drag.el.classList.add('dragging');
    if (drag.kind === 'folder') drag.el.classList.add('drag-collapsed'); // een map sleep je zonder zijn notities
    list.classList.add('reordering');
    list.appendChild(dropLine);
  }
  const rect = list.getBoundingClientRect();
  if (e.clientY < rect.top + 36) list.scrollTop -= 14; else if (e.clientY > rect.bottom - 36) list.scrollTop += 14; // automatisch scrollen aan de randen
  drag.el.style.transform = `translateY(${e.clientY - drag.y + (list.scrollTop - drag.scroll0)}px)`;
  drag.target = drag.kind === 'note' ? noteTarget(e.clientY) : folderTarget(e.clientY);
  placeLine(drag.target.lineY);
});

// Waar landt het gesleepte item? Geeft de map (of de plek tussen mappen), de positie en de hoogte van de invoeglijn.
function noteTarget(y) {
  const secs = sections();
  let sec = secs.find((s) => { const r = s.getBoundingClientRect(); return y >= r.top && y <= r.bottom; });
  if (!sec) sec = secs.reduce((best, s) => { const r = s.getBoundingClientRect(), d = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom)); return !best || d < best.d ? { s, d } : best; }, null).s;
  const others = sec.classList.contains('collapsed') ? [] : itemsOf(sec).filter((o) => o !== drag.el);
  const idx = others.findIndex((o) => { const r = o.getBoundingClientRect(); return y < r.top + r.height / 2; });
  const at = idx < 0 ? others.length : idx;
  const head = sec.querySelector('.na-fhead').getBoundingClientRect();
  const lineY = !others.length ? head.bottom + 3 : at < others.length ? others[at].getBoundingClientRect().top - 5 : others[others.length - 1].getBoundingClientRect().bottom + 3;
  return { sec, others, at, lineY };
}
function folderTarget(y) {
  const others = sections().filter((s) => s !== drag.el);
  const idx = others.findIndex((s) => { const r = s.querySelector('.na-fhead').getBoundingClientRect(); return y < r.top + r.height / 2; });
  const at = idx < 0 ? others.length : idx;
  const lineY = at < others.length ? others[at].getBoundingClientRect().top - 4 : others[others.length - 1].getBoundingClientRect().bottom + 2;
  return { others, at, lineY };
}

function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag; drag = null;
  if (!d.moved) return;
  d.el.classList.remove('dragging', 'drag-collapsed'); d.el.style.transform = '';
  list.classList.remove('reordering'); dropLine.remove();
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  const t = d.target;
  if (cancel || !t) return;
  if (d.kind === 'note') (t.sec.querySelector('.na-fnotes')).insertBefore(d.el, t.others[t.at] || null);
  else list.insertBefore(d.el, t.others[t.at] || null);
  saveLayout();
}
list.addEventListener('pointerup', (e) => endDrag(e, false));
list.addEventListener('pointercancel', (e) => endDrag(e, true));

renderList();
