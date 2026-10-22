import { $, reportError } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { defineType } from './types.js';
import { shapeSvg, SHAPE_KINDS, SHAPE_PRESETS, SHAPE_DEFAULT_W, SHAPE_DEFAULT_H, SHAPE_MIN } from './shapeshape.js';
import { MAX_SIZE } from './state.js';

// Dialoog met twee weergaven en een live voorbeeld dat in beide zichtbaar blijft:
//   1: vorm, kleurstelling en tekst   2: ontwerpopties voor rand, vulling en tekst (via 'Aangepast')
const dlg = $('shapeDialog'), form = $('shapeForm'), preview = $('shapePreview'), kindBox = $('shapeKinds'), presetBox = $('shapePresets'), errBox = $('shapeError');
const FIELDS = ['strokeOn', 'strokeColor', 'strokeW', 'fillOn', 'fillColor', 'fillTransp', 'textColor', 'textSize'];
const outputs = { strokeW: $('strokeWOut'), fillTransp: $('fillTranspOut'), textSize: $('textSizeOut') };
const units = { strokeW: ' px', fillTransp: ' %', textSize: ' px' };
let current = null, choice = null;

const PRESET_KEYS = ['fillOn', 'fillColor', 'strokeOn', 'strokeColor', 'strokeW', 'fillTransp', 'textColor'];
const samePreset = (a, b) => PRESET_KEYS.every((k) => String(a[k]).toLowerCase() === String(b[k]).toLowerCase());
const view1 = $('shapeView1'), view2 = $('shapeView2');
let view = 1, snapshot = null;

function renderPreview() {
  const c = choice, esc = c.text.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  preview.innerHTML = `<div class="shape shape-sample" data-kind="${c.kind}"><div class="shape-art">${shapeSvg(c, 180, 110)}</div>`
    + `<div class="shape-text" style="color:${c.textColor};font-size:${c.textSize}px">${esc}</div></div>`;
  for (const b of kindBox.children) b.setAttribute('aria-pressed', String(b.dataset.kind === c.kind));
  const hit = SHAPE_PRESETS.findIndex((p) => samePreset(c, p));
  [...presetBox.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === (hit < 0 ? SHAPE_PRESETS.length : hit)))); // geen kleurstelling: dan is het 'Aangepast'
  for (const k of FIELDS) {
    const el = form[k];
    if (el.type === 'checkbox') el.checked = c[k]; else el.value = c[k];
    if (outputs[k]) outputs[k].textContent = c[k] + units[k];
  }
  form.strokeColor.disabled = form.strokeW.disabled = !c.strokeOn;
  form.fillColor.disabled = form.fillTransp.disabled = !c.fillOn;
}

for (const [id, name] of SHAPE_KINDS) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.kind = id; b.title = name; b.setAttribute('aria-label', name);
  b.innerHTML = shapeSvg({ kind: id, fillOn: true, fillColor: '#9E9E9E', fillTransp: 0, strokeOn: true, strokeColor: '#616161', strokeW: 2 }, 56, 36);
  b.addEventListener('click', () => { choice.kind = id; renderPreview(); });
  kindBox.appendChild(b);
}
for (const p of SHAPE_PRESETS) {
  const b = document.createElement('button');
  b.type = 'button'; b.title = p.name; b.setAttribute('aria-label', p.name);
  b.innerHTML = shapeSvg({ kind: 'rect', ...p }, 56, 36);
  b.addEventListener('click', () => { for (const k of PRESET_KEYS) choice[k] = p[k]; renderPreview(); });
  presetBox.appendChild(b);
}
// positie 8: 'Aangepast' opent weergave 2
const custom = document.createElement('button');
custom.type = 'button'; custom.className = 'shape-custom'; custom.title = 'Aangepast: rand, vulling en tekst zelf instellen';
custom.innerHTML = '<span aria-hidden="true">🎨</span><span>Aangepast</span>';
custom.addEventListener('click', () => { snapshot = Object.fromEntries(FIELDS.map((k) => [k, choice[k]])); showView(2); });
presetBox.appendChild(custom);

function showView(n) {
  view = n;
  view1.hidden = n !== 1; view2.hidden = n !== 2;
  dlg.scrollTop = 0;
  (n === 1 ? form.text : form.strokeOn).focus({ preventScroll: true });
}
// OK houdt de aanpassingen; Annuleren zet de ontwerpopties terug naar hoe ze waren bij het openen van weergave 2. Beide gaan terug naar weergave 1.
const designOk = () => showView(1);
const designCancel = () => { if (snapshot) Object.assign(choice, snapshot); renderPreview(); showView(1); };
$('shapeDesignOk').addEventListener('click', designOk);
$('shapeDesignCancel').addEventListener('click', designCancel);
dlg.addEventListener('cancel', (e) => { if (view === 2) { e.preventDefault(); designCancel(); } }); // Escape in weergave 2
form.addEventListener('keydown', (e) => { if (view === 2 && e.key === 'Enter') { e.preventDefault(); designOk(); } });
form.text.addEventListener('input', () => { choice.text = form.text.value; errBox.hidden = true; renderPreview(); });
for (const k of FIELDS) {
  form[k].addEventListener('input', () => {
    const el = form[k];
    choice[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    renderPreview();
  });
}
$('shapeCancel').addEventListener('click', () => dlg.close());

export function openShapeDialog(n) {
  current = n;
  choice = { kind: n.kind, text: n.text };
  for (const k of FIELDS) choice[k] = n[k];
  form.text.value = n.text;
  errBox.hidden = true;
  renderPreview();
  showView(1);
  dlg.showModal();
  form.text.focus(); form.text.setSelectionRange(form.text.value.length, form.text.value.length);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  try {
    const { note } = await api({ action: 'item_update', id: current.id, kind: choice.kind, text: choice.text, ...Object.fromEntries(FIELDS.map((k) => [k, choice[k]])) });
    upsert(note);
    dlg.close();
    poll();
  } catch (err) {
    errBox.textContent = err.message; errBox.hidden = false;
    reportError(err);
  }
});

defineType('shape', {
  label: 'Vorm', edit: openShapeDialog, dbl: true, rotatable: true,
  create: () => ({ w: SHAPE_DEFAULT_W, h: SHAPE_DEFAULT_H, top: 60 }), // 60: ruimte boven de vorm voor het rotatiegreepje
  resize: { mode: 'box', min: SHAPE_MIN, max: MAX_SIZE, minH: SHAPE_MIN, maxH: MAX_SIZE, keepRatio: true, fields: ['x', 'y', 'w', 'h'] },
});
