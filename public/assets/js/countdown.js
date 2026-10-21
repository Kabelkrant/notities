import { items, els } from './state.js';
import { $ } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { defineType } from './types.js';
import { COUNTDOWN_STYLES, COUNTDOWN_DEFAULT_SIZE, COUNTDOWN_MIN_SIZE, COUNTDOWN_MAX_SIZE, COUNTDOWN_MAX_LABEL, countdownMarkup, updateCountdown, secondsLeft } from './countdownshape.js';

/* ---------- Ticker: alle afteltimers bijwerken (updateCountdown slaat ongewijzigde stand over) ---------- */
function tickAll() {
  if (document.hidden) return;
  for (const [id, el] of els) {
    const n = items.get(id);
    if (n?.type === 'countdown' && !el.hidden) updateCountdown(el.querySelector('.countdown-art'), n, secondsLeft(n));
  }
}
setInterval(tickAll, 250);
document.addEventListener('visibilitychange', tickAll);

/* ---------- Dialoog: ontwerp, label, datum en tijd ---------- */
const dlg = $('countdownDialog'), form = $('countdownForm'), preview = $('countdownPreview'), styleBox = $('countdownStyles'), errBox = $('countdownError');
let current = null, choice = null;

const pad = (v) => String(v).padStart(2, '0');
// datetime-local gebruikt lokale tijd zonder zone: "2026-10-21T14:30"
const toInput = (sec) => { const d = new Date(sec * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromInput = (v) => { const ms = new Date(v).getTime(); return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0; };

function renderPreview() {
  const n = { ...choice };
  preview.innerHTML = countdownMarkup(n);
  preview._c = {};
  updateCountdown(preview, n, secondsLeft(n));
  for (const b of styleBox.children) b.setAttribute('aria-pressed', String(b.dataset.style === choice.style));
}

for (const [id, name] of COUNTDOWN_STYLES) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.style = id; b.title = name; b.setAttribute('aria-label', name);
  const art = document.createElement('div'); art.className = 'countdown-art';
  const sample = { style: id, label: '', target: Math.floor(Date.now() / 1000) + 2 * 3600 + 25 * 60, showDate: false };
  art.innerHTML = countdownMarkup(sample);
  updateCountdown(art, sample, 2 * 3600 + 25 * 60); // voorbeeld: 2 uur en 25 minuten
  b.appendChild(art);
  b.addEventListener('click', () => { choice.style = id; renderPreview(); });
  styleBox.appendChild(b);
}

form.label.addEventListener('input', () => { choice.label = form.label.value.trim().slice(0, COUNTDOWN_MAX_LABEL); renderPreview(); });
form.when.addEventListener('input', () => {
  const t = fromInput(form.when.value);
  if (!t) return;
  errBox.hidden = true;
  choice.target = t;
  renderPreview();
});
form.showDate.addEventListener('change', () => { choice.showDate = form.showDate.checked; renderPreview(); });
$('countdownCancel').addEventListener('click', () => dlg.close());

export function openCountdownDialog(n) {
  current = n;
  choice = { style: n.style, label: n.label || '', target: n.target, showDate: n.showDate !== false };
  form.label.value = choice.label;
  form.showDate.checked = choice.showDate;
  form.when.value = toInput(n.target);
  errBox.hidden = true;
  renderPreview();
  dlg.showModal();
  form.label.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const target = fromInput(form.when.value);
  if (!target) { errBox.textContent = 'Vul een geldige datum en tijd in'; errBox.hidden = false; return; }
  if (target !== current.target && target <= Date.now() / 1000) { errBox.textContent = 'Kies een moment in de toekomst'; errBox.hidden = false; return; }
  try {
    const { note } = await api({ action: 'item_update', id: current.id, style: choice.style, label: form.label.value.trim(), target, showDate: form.showDate.checked });
    upsert(note);
    dlg.close();
    poll();
  } catch (err) {
    errBox.textContent = err.message; errBox.hidden = false;
  }
});

defineType('countdown', {
  label: 'Afteller', edit: openCountdownDialog, dbl: true,
  create: () => ({ w: COUNTDOWN_DEFAULT_SIZE, top: 20 }),
  resize: { mode: 'square', min: COUNTDOWN_MIN_SIZE, max: COUNTDOWN_MAX_SIZE, fields: ['w'] },
});
