import { items, els } from './state.js';
import { $, board, reportError } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { freeSpot } from './dialog.js';
import { CLOCK_STYLES, CLOCK_DEFAULT_SIZE, CLOCK_MAX_LABEL, clockMarkup, updateClock, timeIn } from './clockshape.js';

/* ---------- Ticker: één timer voor alle klokken, op de hele seconde ---------- */
function tickAll() {
  if (document.hidden) return;
  const now = new Date(), cache = new Map();
  for (const [id, el] of els) {
    const n = items.get(id);
    if (n?.type === 'clock' && !el.hidden) updateClock(el.querySelector('.clock-art'), n, timeIn(n.tz, now, cache));
  }
}
function schedule() {
  setTimeout(() => { tickAll(); schedule(); }, 1000 - (Date.now() % 1000) + 8);
}
schedule();
document.addEventListener('visibilitychange', tickAll); // direct bijwerken bij terugkeer naar de tab

/* ---------- Nieuwe klok ---------- */
export async function createClock() {
  try {
    const { x, y } = freeSpot(CLOCK_DEFAULT_SIZE, CLOCK_DEFAULT_SIZE, 20);
    const { note } = await api({ action: 'create_clock', x, y, w: CLOCK_DEFAULT_SIZE });
    upsert(note);
    const el = els.get(note.id);
    board.appendChild(el);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    el.focus({ preventScroll: true });
    poll();
  } catch (err) {
    reportError(err);
  }
}

/* ---------- Dialoog: stijl, tijdzone, label, secondewijzer ---------- */
const dlg = $('clockDialog'), form = $('clockForm'), preview = $('clockPreview'), styleBox = $('clockStyles'), errBox = $('clockError');
let current = null, choice = null, previewTimer = null;

// Tijdzones voor de zoeklijst: eerst veelgebruikte, daarna alle bekende
const COMMON_TZ = ['Europe/Amsterdam', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Moscow', 'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
let allTz = COMMON_TZ;
try { allTz = [...COMMON_TZ, ...Intl.supportedValuesOf('timeZone').filter((z) => !COMMON_TZ.includes(z))]; } catch { /* oudere browser: alleen de veelgebruikte */ }
const dl = $('clockTzList');
for (const z of allTz) dl.appendChild(Object.assign(document.createElement('option'), { value: z }));
const tzSet = new Set(allTz);

function fixedTime() { return { h: 10, m: 8, s: 35 }; }

function renderPreview() {
  const n = { ...choice };
  preview.innerHTML = clockMarkup(n);
  preview._c = {};
  updateClock(preview, n, timeIn(n.tz, new Date()));
  for (const b of styleBox.children) b.setAttribute('aria-pressed', String(b.dataset.style === choice.style));
}

for (const [id, name] of CLOCK_STYLES) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.style = id; b.title = name; b.setAttribute('aria-label', name);
  const art = document.createElement('div'); art.className = 'clock-art';
  art.innerHTML = clockMarkup({ style: id, seconds: false, label: '', tz: '' });
  updateClock(art, { style: id, seconds: false }, fixedTime());
  b.appendChild(art);
  b.addEventListener('click', () => { choice.style = id; renderPreview(); });
  styleBox.appendChild(b);
}

form.label.addEventListener('input', () => { choice.label = form.label.value.trim().slice(0, CLOCK_MAX_LABEL); renderPreview(); });
form.seconds.addEventListener('change', () => { choice.seconds = form.seconds.checked; renderPreview(); });
form.tz.addEventListener('change', () => {
  const v = form.tz.value.trim();
  errBox.hidden = v === '' || tzSet.has(v);
  errBox.textContent = errBox.hidden ? '' : 'Onbekende tijdzone. Kies er een uit de lijst, of laat het veld leeg voor lokale tijd.';
  choice.tz = tzSet.has(v) ? v : '';
  renderPreview();
});
$('clockCancel').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', () => { clearInterval(previewTimer); previewTimer = null; });

export function openClockDialog(n) {
  current = n;
  choice = { style: n.style, tz: n.tz || '', label: n.label || '', seconds: n.seconds !== false };
  form.tz.value = choice.tz; form.label.value = choice.label; form.seconds.checked = choice.seconds;
  errBox.hidden = true;
  renderPreview();
  dlg.showModal();
  clearInterval(previewTimer);
  previewTimer = setInterval(() => updateClock(preview, choice, timeIn(choice.tz, new Date())), 1000);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const tz = form.tz.value.trim();
  if (tz !== '' && !tzSet.has(tz)) { errBox.hidden = false; errBox.textContent = 'Onbekende tijdzone. Kies er een uit de lijst, of laat het veld leeg voor lokale tijd.'; return; }
  try {
    const { note } = await api({ action: 'clock_update', id: current.id, style: choice.style, tz, label: form.label.value.trim(), seconds: form.seconds.checked });
    upsert(note);
    dlg.close();
    poll();
  } catch (err) {
    errBox.hidden = false; errBox.textContent = err.message;
  }
});
