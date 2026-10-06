const boot = JSON.parse(document.getElementById('boot').textContent);
const csrf = boot.csrf;
const POLL_MS = 4000;
const UNDO_MS = 6000;
const MIN_SIZE = 40, MAX_SIZE = 5000;
const FIT = 262; // beginformaat afbeelding, gelijk aan de notitiebreedte
const COLORS = ['#FFF59D', '#FFCC80', '#F48FB1', '#CE93D8', '#90CAF9', '#80DEEA', '#A5D6A7', '#E0E0E0'];

const $ = (id) => document.getElementById(id);
const board = $('board'), dialog = $('noteDialog'), form = $('noteForm');
const statusEl = $('status'), toast = $('toast');

const items = new Map();   // id -> data (notitie of afbeelding)
const els = new Map();     // id -> element
const pendingDelete = new Map(); // id -> {timer, commit}
let version = boot.version;
let busy = false;          // slepen of schalen bezig
let missedWhileBusy = false;
let statusHoldUntil = 0;

/* ---------- API ---------- */
async function api(payload, opts = {}) {
  const res = await fetch('api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify(payload),
    keepalive: opts.keepalive || false,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
  return data;
}

function setStatus(text, isError = false, holdMs = 0) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
  statusHoldUntil = Date.now() + holdMs;
}
const reportError = (err) => setStatus(err.message, true, 6000);

/* ---------- Rendering ---------- */
const sig = (n) => [n.type, n.title, n.body, n.color, n.file, n.x, n.y, n.w, n.h, n.updated].join('\u0001');

function buildItem(n) {
  const el = document.createElement(n.type === 'image' ? 'figure' : 'article');
  el.tabIndex = 0;
  el.dataset.id = n.id;
  if (n.type === 'image') {
    el.className = 'item image';
    el.setAttribute('aria-label', 'Afbeelding');
    el.innerHTML = `
      <img alt="" draggable="false">
      <button type="button" class="delete-btn" title="Verwijderen" aria-label="Verwijderen">🗑️</button>
      <span class="resize-handle" aria-hidden="true"></span>`;
    el.querySelector('img').src = 'image.php?f=' + encodeURIComponent(n.file);
  } else {
    el.className = 'item note';
    el.innerHTML = `
      <div class="note-head" title="Sleep om te verplaatsen"></div>
      <div class="note-actions">
        <button type="button" class="edit-btn" title="Bewerken" aria-label="Bewerken">✏️</button>
        <button type="button" class="delete-btn" title="Verwijderen" aria-label="Verwijderen">🗑️</button>
      </div>
      <strong class="title-text"></strong>
      <div class="body-text"></div>`;
  }
  return el;
}

// Tekstkleur op basis van de achtergrond: kies wit of de donkere tekstkleur, wat het meeste contrast geeft (WCAG)
const DARK_TEXT = '#1d1f27';
const luminance = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
};
const DARK_TEXT_L = luminance(DARK_TEXT);
// Voorkeur voor donkere tekst: 1 = puur het grootste contrast, lager = pas later wit (0.3 => alleen bij donkere achtergronden, luminantie < ~0,09)
const LIGHT_TEXT_BIAS = 0.3;
function needsLightText(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const L = luminance(hex);
  return (1.05 / (L + 0.05)) * LIGHT_TEXT_BIAS > (L + 0.05) / (DARK_TEXT_L + 0.05); // contrast met wit (gewogen) > contrast met donker
}

function paint(el, n) {
  el.style.left = n.x + 'px';
  el.style.top = n.y + 'px';
  if (n.type === 'image') {
    el.style.width = n.w + 'px';
    el.style.height = n.h + 'px';
    return;
  }
  el.style.background = n.color;
  el.classList.toggle('on-dark', needsLightText(n.color));
  el.querySelector('.title-text').textContent = n.title;
  el.setAttribute('aria-label', n.title);
  // n.html komt van Parsedown in safe mode (server-side gesaniteerd)
  el.querySelector('.body-text').innerHTML = n.html;
}

function upsert(n) {
  items.set(n.id, n);
  let el = els.get(n.id);
  if (!el) {
    el = buildItem(n);
    els.set(n.id, el);
    board.appendChild(el);
  }
  paint(el, n);
}

function remove(id) {
  items.delete(id);
  els.get(id)?.remove();
  els.delete(id);
}

function applyServerItems(list) {
  const seen = new Set();
  for (const n of list) {
    if (pendingDelete.has(n.id)) continue;
    seen.add(n.id);
    const old = items.get(n.id);
    if (!old || sig(old) !== sig(n)) upsert(n);
    board.appendChild(els.get(n.id)); // volgorde = laatst gewijzigd bovenaan
  }
  for (const id of [...items.keys()]) if (!seen.has(id) && !pendingDelete.has(id)) remove(id);
}

/* ---------- Live sync (polling) ---------- */
async function poll() {
  if (document.hidden) return;
  if (busy || dialog.open) { missedWhileBusy = true; return; }
  try {
    const res = await fetch('api.php?v=' + version, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.changed) {
      version = data.version;
      // focus behouden: appendChild verplaatst elementen en kan de focus kwijtraken
      const focused = document.activeElement?.closest?.('.item');
      applyServerItems(data.notes);
      if (focused && els.has(Number(focused.dataset.id)) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }
    missedWhileBusy = false;
    if (statusEl.classList.contains('error') && Date.now() > statusHoldUntil) setStatus('');
  } catch {
    setStatus('Offline – opnieuw proberen…', true);
  }
}
setInterval(poll, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
dialog.addEventListener('close', () => { if (missedWhileBusy) poll(); });

/* ---------- Nieuw-menu ---------- */
const newBtn = $('newBtn'), newMenu = $('newMenu');
function toggleMenu(open = newMenu.hidden) {
  newMenu.hidden = !open;
  newBtn.setAttribute('aria-expanded', String(open));
  if (open) newMenu.querySelector('button').focus();
}
newBtn.addEventListener('click', () => toggleMenu());
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.split')) toggleMenu(false); });
newMenu.addEventListener('keydown', (e) => {
  const btns = [...newMenu.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
  if (e.key === 'Escape') { toggleMenu(false); newBtn.focus(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
});
$('newNote').addEventListener('click', () => { toggleMenu(false); openDialog(null); });
$('newImage').addEventListener('click', () => { toggleMenu(false); $('imageInput').click(); });

/* ---------- Notitie-dialoog ---------- */
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

function openDialog(n) {
  form.reset();
  $('formError').hidden = true;
  $('dialogTitle').textContent = n ? 'Notitie bewerken' : 'Nieuwe notitie';
  form.id.value = n ? n.id : '';
  form.title.value = n ? n.title : '';
  form.body.value = n ? n.body : '';
  setColor(n ? n.color : COLORS[0]);
  dialog.showModal();
  form.title.focus();
}
$('cancelBtn').addEventListener('click', () => dialog.close());
// De dialoog sluit via Annuleren, Opslaan of Escape; niet door buiten het venster te klikken (dat gaf verloren invoer).

/* ---------- Opmaak-toolbar (Markdown in de textarea) ---------- */
const bodyField = form.body;

// Vervang een stuk tekst via insertText, zodat Ctrl+Z blijft werken
function replaceRange(start, end, text, selStart, selEnd) {
  bodyField.focus();
  bodyField.setSelectionRange(start, end);
  if (!document.execCommand('insertText', false, text)) bodyField.setRangeText(text, start, end, 'end');
  bodyField.setSelectionRange(selStart, selEnd);
}

function toggleInline(mark) {
  const v = bodyField.value, s = bodyField.selectionStart, e = bodyField.selectionEnd, m = mark.length;
  const sel = v.slice(s, e);
  const single = mark === '*'; // cursief niet verwarren met de ** van dik
  const wrappedOutside = v.slice(s - m, s) === mark && v.slice(e, e + m) === mark
    && !(single && (v[s - 2] === '*' || v[e + 1] === '*'));
  if (wrappedOutside) return replaceRange(s - m, e + m, sel, s - m, e - m);
  const wrappedInside = sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark)
    && !(single && (sel.startsWith('**') && sel.endsWith('**')));
  if (wrappedInside) return replaceRange(s, e, sel.slice(m, -m), s, e - 2 * m);
  replaceRange(s, e, mark + sel + mark, s + m, e + m);
}

function toggleList(kind) {
  const v = bodyField.value;
  let s = bodyField.selectionStart, e = bodyField.selectionEnd;
  if (e > s && v[e - 1] === '\n') e--;
  const start = v.lastIndexOf('\n', s - 1) + 1;
  const nl = v.indexOf('\n', e);
  const end = nl === -1 ? v.length : nl;
  const lines = v.slice(start, end).split('\n');
  const re = kind === 'bullets' ? /^\s*[-*+] / : /^\s*\d+\. /;
  const anyList = /^\s*([-*+]|\d+\.) /;
  const filled = lines.filter((l) => l.trim());
  const remove = filled.length > 0 && filled.every((l) => re.test(l));
  let n = 0;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    if (remove) return l.replace(re, '');
    const plain = l.replace(anyList, '');
    return kind === 'bullets' ? '- ' + plain : `${++n}. ${plain}`;
  }).join('\n');
  replaceRange(start, end, out, start, start + out.length);
}

const FORMATS = {
  bold: () => toggleInline('**'),
  italic: () => toggleInline('*'),
  underline: () => toggleInline('++'),
  bullets: () => toggleList('bullets'),
  numbers: () => toggleList('numbers'),
};
document.querySelector('.fmt-bar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // focus in de textarea houden
document.querySelector('.fmt-bar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fmt]');
  if (b) FORMATS[b.dataset.fmt]();
});
bodyField.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
  const fmt = { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
  if (fmt) { e.preventDefault(); FORMATS[fmt](); }
});

function freeSpot() {
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
  try {
    const { note } = await api(payload);
    upsert(note);
    board.appendChild(els.get(note.id));
    dialog.close();
    if (!id) els.get(note.id).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    poll();
  } catch (err) {
    const box = $('formError'); box.textContent = err.message; box.hidden = false;
  }
});

/* ---------- Afbeelding uploaden ---------- */
// De browser houdt rekening met EXIF-rotatie, dus meet het formaat daar.
function naturalSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

$('imageInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  setStatus('Uploaden…');
  try {
    const fd = new FormData();
    fd.append('file', file);
    const size = await naturalSize(file);
    if (size) { fd.append('w', size.w); fd.append('h', size.h); }
    const { x, y } = freeSpot();
    fd.append('x', x); fd.append('y', y);
    const res = await fetch('api.php', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || (res.status === 413 ? 'Afbeelding is te groot' : `Fout ${res.status}`));
    upsert(data.note);
    const el = els.get(data.note.id);
    board.appendChild(el);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setStatus('');
    poll();
  } catch (err) {
    reportError(err);
  }
});

/* ---------- Bewerken / verwijderen ---------- */
board.addEventListener('click', (e) => {
  const item = e.target.closest('.item'); if (!item) return;
  const id = Number(item.dataset.id);
  if (e.target.closest('.edit-btn')) openDialog(items.get(id));
  if (e.target.closest('.delete-btn')) softDelete(id);
});
board.addEventListener('dblclick', (e) => {
  const item = e.target.closest('.note');
  if (item && e.target.closest('.note-head')) openDialog(items.get(Number(item.dataset.id)));
});
board.addEventListener('keydown', (e) => {
  const item = e.target.closest('.item');
  if (!item || e.target !== item) return;
  const id = Number(item.dataset.id), n = items.get(id);
  if (e.key === 'Enter' && n.type === 'note') openDialog(n);
  else if (e.key === 'Delete') softDelete(id);
  else if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    const step = e.shiftKey ? 50 : 10;
    n.x = Math.max(0, n.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0));
    n.y = Math.max(0, n.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0));
    paint(item, n);
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
  const label = n.type === 'image' ? 'Afbeelding' : `"${n.title}"`;
  showToast(`${label} verwijderd`, () => {
    clearTimeout(timer); pendingDelete.delete(id); els.get(id).hidden = false;
  });
}
// Nog openstaande verwijderingen alsnog afronden bij sluiten van de pagina
addEventListener('pagehide', () => { for (const p of [...pendingDelete.values()]) { clearTimeout(p.timer); p.commit(true); } });

let toastUndo = null;
function showToast(text, onUndo) {
  $('toastText').textContent = text; toastUndo = onUndo; toast.hidden = false;
}
function hideToast() { toast.hidden = true; toastUndo = null; }
$('toastAction').addEventListener('click', () => { toastUndo?.(); hideToast(); });

/* ---------- Slepen en schalen (Pointer Events) ---------- */
let drag = null, resize = null;

board.addEventListener('pointerdown', (e) => {
  const item = e.target.closest('.item');
  if (!item || e.button > 0) return;

  const handle = e.target.closest('.resize-handle');
  if (handle) {
    const n = items.get(Number(item.dataset.id));
    resize = { item, n, sx: e.clientX, sy: e.clientY, ow: n.w, oh: n.h, id: e.pointerId };
    busy = true;
    item.focus({ preventScroll: true });
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  if (e.target.closest('button, a')) return;
  // notities sleep je alleen via de kop; de tekst blijft selecteerbaar
  if (item.classList.contains('note') && !e.target.closest('.note-head')) return;
  const n = items.get(Number(item.dataset.id));
  drag = { item, n, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false, id: e.pointerId };
  item.setPointerCapture(e.pointerId);
});

board.addEventListener('pointermove', (e) => {
  if (resize && e.pointerId === resize.id) {
    const { n, item } = resize;
    n.w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(resize.ow + e.clientX - resize.sx)));
    n.h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(resize.oh + e.clientY - resize.sy)));
    item.style.width = n.w + 'px';
    item.style.height = n.h + 'px';
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  if (!drag.moved) {
    drag.moved = true; busy = true;
    drag.item.classList.add('dragging');
    const focused = document.activeElement;
    board.appendChild(drag.item); // naar voren; herstel daarna de focus
    if (focused === drag.item) drag.item.focus({ preventScroll: true });
  }
  drag.n.x = Math.max(0, Math.round(drag.ox + dx));
  drag.n.y = Math.max(0, Math.round(drag.oy + dy));
  drag.item.style.left = drag.n.x + 'px';
  drag.item.style.top = drag.n.y + 'px';
});

function endPointer(e) {
  if (resize && e.pointerId === resize.id) {
    const n = resize.n;
    resize = null; busy = false;
    api({ action: 'resize', id: n.id, w: n.w, h: n.h }).then(poll).catch((err) => reportError(new Error('Formaat opslaan mislukt: ' + err.message)));
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const { n, item, moved } = drag;
  drag = null; busy = false;
  item.classList.remove('dragging');
  if (moved) saveMove(n); // alleen opslaan als er echt is versleept
}
board.addEventListener('pointerup', endPointer);
board.addEventListener('pointercancel', endPointer);

async function saveMove(n) {
  try {
    await api({ action: 'move', id: n.id, x: n.x, y: n.y });
    poll();
  } catch (err) {
    reportError(new Error('Positie opslaan mislukt: ' + err.message));
  }
}

/* ---------- Start ---------- */
applyServerItems(boot.notes);
