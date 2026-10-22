import { COLORS, TRASH, items, els, hiddenIds, state } from './state.js';
import { $ } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { freeSpot } from './dialog.js';
import { softDelete } from './actions.js';
import { needsLightText } from './color.js';
import { setupEditor } from './format.js';
import { createBodyEditor } from './bodyeditor.js';

// Notitie-app: links een boomstructuur van mappen met notities (1/3), rechts de editor (2/3), zoals een e-mailprogramma.
// Mappen staan op het bovenste niveau, notities altijd daaronder (geen geneste mappen). Notities zonder map staan in '(niet ingedeeld)' (map 0).
// Volgorde en indeling horen alleen bij deze weergave; positie en stapelvolgorde op het canvas blijven er los van.
const app = $('notesApp'), list = $('naList'), editorBox = $('naEditor'), empty = $('naEmpty');
const titleInput = $('naTitle'), swatchBox = $('naSwatches'), savedEl = $('naSaved'), conflictBox = $('naConflict');
const SAVE_DELAY = 700, GENERAL = 0;

// Twee editors in dezelfde kolom: de visuele editor (Tiptap) voor notities met de opmaak die hij kent, en de Markdown-editor van het notitievenster
// op het canvas voor notities met iets anders (koppen, code, tabellen, ...). De opmaakbalk wordt in beide gekopieerd van dat notitievenster.
const plainField = $('bodyField').closest('.field').cloneNode(true);
plainField.querySelector('.field-label')?.remove();
plainField.querySelector('.emoji-pop').innerHTML = '';
const body = plainField.querySelector('textarea');
for (const a of ['id', 'name', 'required']) body.removeAttribute(a);
plainField.querySelector('.fmt-bar').removeAttribute('aria-controls');
body.setAttribute('aria-label', 'Inhoud van de notitie (Markdown)');
$('naBodyField').appendChild(plainField);
setupEditor(plainField, body, null);
const editor = createBodyEditor({ plainField, textarea: body, onInput: () => touch(), onBlur: () => { if (dirty) save(); } });

let activeId = null, dirty = false, saving = false, saveTimer = 0, base = null, color = COLORS[0], conflict = false;

// Ingeklapte mappen onthouden we per browser
let collapsed = new Set([TRASH]); // de Prullenbak staat standaard ingeklapt
try { const raw = localStorage.getItem('na-collapsed'); if (raw !== null) collapsed = new Set(JSON.parse(raw)); } catch { /* geen opslag beschikbaar */ }
const saveCollapsed = () => { try { localStorage.setItem('na-collapsed', JSON.stringify([...collapsed])); } catch { /* geen opslag */ } };

const folderIds = () => state.folders.map((f) => f.id);
const folderOf = (n) => folderIds().includes(n.folder) ? n.folder : GENERAL; // een onbekende map telt als (niet ingedeeld)
const gone = (id) => els.get(id)?.hidden || hiddenIds.has(id); // tijdelijk weggehaald (definitief verwijderen loopt)
const editedAt = (n) => Date.parse(n.edited) || 0;
// Binnen een map staan de notities op laatst inhoudelijk bijgewerkt, de nieuwste bovenaan (geen handmatige volgorde)
const visibleNotes = () => [...items.values()].filter((n) => n.type === 'note' && !gone(n.id)).sort((a, b) => editedAt(b) - editedAt(a) || b.id - a.id);
const section = (fid) => list.querySelector(`.na-folder[data-folder="${fid}"]`);
const itemEl = (id) => list.querySelector(`.na-item[data-id="${id}"]`);
const sections = () => [...list.querySelectorAll('.na-folder')];
const itemsOf = (sec) => [...sec.querySelectorAll('.na-item')];

/* ---------- Verschuifbare grens tussen lijst en editor (breedte in de cookie 'nasplit') ---------- */
const splitter = $('naSplitter'), MIN_LEFT = 200, MIN_RIGHT = 420, GRIP = 9;
const maxLeft = () => Math.max(MIN_LEFT, app.clientWidth - MIN_RIGHT - GRIP);
const leftWidth = () => Math.round(list.closest('.na-list-pane').getBoundingClientRect().width);
let customSplit = /--na-left/.test(app.getAttribute('style') || '');
function setLeft(px, save = false) {
  px = Math.round(Math.min(maxLeft(), Math.max(MIN_LEFT, px)));
  app.style.setProperty('--na-left', px + 'px');
  splitter.setAttribute('aria-valuenow', String(px));
  customSplit = true;
  if (save) document.cookie = `nasplit=${px}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
let resizing = null;
splitter.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  resizing = { pid: e.pointerId };
  splitter.setPointerCapture(e.pointerId);
  app.classList.add('na-resizing');
  e.preventDefault();
});
splitter.addEventListener('pointermove', (e) => { if (resizing && e.pointerId === resizing.pid) setLeft(e.clientX - app.getBoundingClientRect().left); });
function endResize(e) {
  if (!resizing || e.pointerId !== resizing.pid) return;
  resizing = null; app.classList.remove('na-resizing');
  setLeft(leftWidth(), true);
}
splitter.addEventListener('pointerup', endResize);
splitter.addEventListener('pointercancel', endResize);
splitter.addEventListener('dblclick', () => { // terug naar de standaardverdeling (een derde)
  app.style.removeProperty('--na-left'); customSplit = false;
  document.cookie = 'nasplit=; path=/; max-age=0; SameSite=Lax';
});
splitter.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  setLeft(leftWidth() + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 100 : 20), true);
});
addEventListener('resize', () => { if (customSplit && app.clientWidth) setLeft(leftWidth()); }); // een kleiner venster: de lijst krimpt mee, de editor houdt zijn minimale breedte
window.addEventListener('mode:changed', () => { if (customSplit && app.clientWidth) setLeft(leftWidth()); });

/* ---------- Laatste bewerking: vandaag de tijd, gisteren 'Gisteren', eerder de datum ---------- */
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function formatEdited(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d >= today) return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (d >= yesterday) return 'Gisteren';
  return d.getFullYear() === now.getFullYear() ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : String(d.getFullYear()); // een eerder jaar: alleen het jaartal
}
// De volledige datum voor de statusbalk onder de editor, bijvoorbeeld 'Laatst bijgewerkt: 22 oktober 2026 om 20:28'
const lastUpdated = (n) => n.edited && !isNaN(new Date(n.edited)) ? 'Laatst bijgewerkt: ' + new Date(n.edited).toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' }) : '';
setInterval(() => { for (const el of list.querySelectorAll('.na-item')) { const n = items.get(Number(el.dataset.id)); if (n) el.querySelector('.na-time').textContent = formatEdited(n.edited); } }, 60000); // 'vandaag' wordt vanzelf 'Gisteren'

/* ---------- Boom ---------- */
function buildFolder(f) {
  const sec = document.createElement('section');
  sec.className = 'na-folder'; sec.dataset.folder = f.id;
  sec.innerHTML = `<div class="na-fhead" tabindex="0" role="treeitem">
      <span class="na-grip" aria-hidden="true" title="Sleep om de map te verplaatsen">⋮⋮</span>
      <span class="na-ficon" aria-hidden="true">📂</span><span class="na-fname"></span>
      <span class="na-factions"><button type="button" class="na-fedit" title="Naam wijzigen" aria-label="Naam wijzigen">✏️</button><button type="button" class="na-fdel" title="Map verwijderen" aria-label="Map verwijderen">🗑️</button></span>
    </div><div class="na-fnotes" role="group"></div>`;
  if (f.id <= GENERAL) sec.querySelector('.na-factions').hidden = true; // de systeemmappen (niet ingedeeld) en Prullenbak blijven altijd bestaan
  return sec;
}

function buildItem(n) {
  const el = document.createElement('div');
  el.className = 'na-item'; el.dataset.id = n.id; el.tabIndex = 0; el.setAttribute('role', 'treeitem');
  el.innerHTML = '<div class="na-tile"><span class="na-grip" aria-hidden="true" title="Sleep om de volgorde te wijzigen">⋮⋮</span><span class="na-title"></span></div><span class="na-time"></span>';
  return el;
}

// Verandert de lijst (een notitie is bijgewerkt en schuift naar boven, een map klapt in of uit), dan glijden de blokjes naar hun nieuwe plek:
// we onthouden waar alles stond, bouwen de lijst opnieuw op en laten elk blokje van zijn oude plek naar de nieuwe schuiven.
const ROW = '.na-item, .na-fhead';
const rowKey = (el) => el.classList.contains('na-item') ? 'n' + el.dataset.id : 'f' + el.closest('.na-folder').dataset.folder;
function renderList() {
  if (drag?.moved) return; // niet midden in het slepen
  const animate = app.clientWidth > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const was = new Map();
  if (animate) for (const el of list.querySelectorAll(ROW)) if (el.offsetParent !== null) was.set(rowKey(el), el.getBoundingClientRect().top);
  renderListNow();
  if (!animate) return;
  for (const el of list.querySelectorAll(ROW)) {
    const from = was.get(rowKey(el));
    if (from === undefined || el.offsetParent === null) continue;
    const dy = from - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
}

function renderListNow() {
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
    sec.querySelector('.na-ficon').textContent = f.id === TRASH ? '🗑️' : isCollapsed ? '📁' : '📂'; // dichte of geopende map; de Prullenbak heeft een eigen icoon
    if (!sec.querySelector('.na-rename')) sec.querySelector('.na-fname').textContent = f.name;
    const count = byFolder.get(f.id).length; // het aantal staat alleen in de tooltip bij de naam
    sec.querySelector('.na-fname').title = count === 0 ? 'Geen notities' : count === 1 ? '1 notitie' : `${count} notities`;
    const box = sec.querySelector('.na-fnotes');
    byFolder.get(f.id).forEach((n, j) => {
      let el = keepItems.get(n.id);
      keepItems.delete(n.id);
      if (!el) el = buildItem(n);
      el.querySelector('.na-tile').style.background = n.color;
      el.classList.toggle('on-dark', needsLightText(n.color));
      const title = el.querySelector('.na-title');
      title.textContent = n.title;
      title.title = n.title; // de volledige naam, voor als hij is ingekort
      const time = el.querySelector('.na-time');
      time.textContent = formatEdited(n.edited);
      time.title = lastUpdated(n);
      el.classList.toggle('active', n.id === activeId);
      el.setAttribute('aria-selected', String(n.id === activeId));
      if (box.children[j] !== el) box.insertBefore(el, box.children[j] || null);
    });
  });
  for (const el of keepItems.values()) el.remove();
  for (const s of keepSec.values()) s.remove();
  const first = list.querySelector('.na-item');
  if (activeId === null && first && !matchMedia('(max-width: 720px)').matches) select(Number(first.dataset.id)); // desktop: meteen de eerste notitie openen
}

/* ---------- Editor ---------- */
const snapshot = () => ({ title: titleInput.value, body: editor.getValue(), color });
function setSaved(text) { savedEl.textContent = text; }

// De kleur van de notitie voor het tekstvak (de menging met wit of zwart, en de tekstkleur, regelt de CSS per thema)
function tint() { editorBox.style.setProperty('--na-color', color); }

function fill(n, selection) {
  titleInput.value = n.title;
  editor.load(n.body, selection);
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
  setSaved(lastUpdated(n)); // bij het openen: wanneer de notitie voor het laatst is bijgewerkt; daarna meldt dezelfde plek het opslaan
  editorBox.hidden = false; empty.hidden = true;
  app.classList.add('na-open'); // smal scherm: toon de editor in plaats van de lijst
  if (collapsed.delete(folderOf(n))) { saveCollapsed(); renderList(); } // de map van de gekozen notitie klapt open
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
  const id = activeId, order = [...list.querySelectorAll('.na-folder:not(.collapsed) .na-item')].map((e) => Number(e.dataset.id)), i = order.indexOf(id), next = order[i + 1] ?? order[i - 1];
  clearTimeout(saveTimer); dirty = false;
  softDelete([id]); // naar de Prullenbak, met melding en Ongedaan maken; uit de Prullenbak definitief
  renderList();
  if (next !== undefined && next !== id) select(next); else showNone();
});
/* ---------- Nieuwe notitie: ook op het canvas, met dezelfde automatische plaatsing ---------- */
$('naNew').addEventListener('click', async () => {
  await flush();
  try {
    const { x, y } = freeSpot();
    const cur = items.get(activeId), curFolder = cur ? folderOf(cur) : GENERAL, folder = curFolder === TRASH ? GENERAL : curFolder; // in de map van de geopende notitie (niet in de Prullenbak)
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
    if (!n || gone(activeId)) { const first = list.querySelector('.na-item'); first ? select(Number(first.dataset.id)) : showNone(); return; }
    if (!dirty && !saving && base && (n.title !== base.title || n.body !== base.body || n.color !== base.color)) { // door iemand anders gewijzigd
      fill(n, editor.selection());
      setSaved(lastUpdated(n));
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
  const toggled = [];
  notes.forEach(([id, fid], i) => { const n = items.get(id); if (n) { if ((n.folder === TRASH) !== (fid === TRASH)) toggled.push(n); n.order = i; n.folder = fid; } });
  for (const n of toggled) upsert(n); // naar de Prullenbak: van het canvas af; eruit: terug op het canvas
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

function moveNote(el, dir) { // Alt+pijl omhoog of omlaag: naar de vorige of volgende map (binnen een map staat de volgorde vast op bijwerkdatum)
  const all = sections(), to = all[all.indexOf(el.closest('.na-folder')) + dir];
  if (!to) return;
  to.querySelector('.na-fnotes').appendChild(el);
  if (collapsed.delete(Number(to.dataset.folder))) saveCollapsed();
  saveLayout(); renderList();
  itemEl(Number(el.dataset.id))?.focus();
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
    if (drag.kind === 'folder') list.appendChild(dropLine); // alleen mappen hebben een invoeglijn; een notitie landt in een map
  }
  const rect = list.getBoundingClientRect();
  if (e.clientY < rect.top + 36) list.scrollTop -= 14; else if (e.clientY > rect.bottom - 36) list.scrollTop += 14; // automatisch scrollen aan de randen
  drag.el.style.transform = `translateY(${e.clientY - drag.y + (list.scrollTop - drag.scroll0)}px)`;
  drag.target = drag.kind === 'note' ? noteTarget(e.clientY) : folderTarget(e.clientY);
  if (drag.kind === 'folder') placeLine(drag.target.lineY);
  else for (const s of sections()) s.classList.toggle('na-drop-target', s === drag.target.sec && s !== drag.el.closest('.na-folder')); // de map waar de notitie in komt
});

// Waar landt het gesleepte item? Een notitie landt in de map onder de aanwijzer (de volgorde volgt de bijwerkdatum); een map tussen twee mappen.
function noteTarget(y) {
  const secs = sections();
  let sec = secs.find((s) => { const r = s.getBoundingClientRect(); return y >= r.top && y <= r.bottom; });
  if (!sec) sec = secs.reduce((best, s) => { const r = s.getBoundingClientRect(), d = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom)); return !best || d < best.d ? { s, d } : best; }, null).s;
  return { sec };
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
  for (const s of sections()) s.classList.remove('na-drop-target');
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  const t = d.target;
  if (cancel || !t) return;
  if (d.kind === 'note') {
    if (t.sec === d.el.closest('.na-folder')) return; // zelfde map: er verandert niets
    t.sec.querySelector('.na-fnotes').appendChild(d.el);
    saveLayout(); renderList(); // de notitie glijdt naar zijn plek op bijwerkdatum
    return;
  }
  list.insertBefore(d.el, t.others[t.at] || null);
  saveLayout();
}
list.addEventListener('pointerup', (e) => endDrag(e, false));
list.addEventListener('pointercancel', (e) => endDrag(e, true));

renderList();
