import { $, reportError } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { defineType } from './types.js';
import { arrowSvg, ARROW_STYLES, ARROW_COLORS, ARROW_DEFAULT_W, ARROW_DEFAULT_H, ARROW_MIN_W, ARROW_MIN_H, ARROW_MAX_H } from './arrowshape.js';
import { MAX_SIZE } from './state.js';

// Dialoog voor ontwerp en kleur
const dlg = $('arrowDialog'), form = $('arrowForm'), preview = $('arrowPreview'), styleBox = $('arrowStyles'), swatches = $('arrowSwatches');
let current = null, choice = { style: 'solid', color: '#e53935' };

function renderPreview() {
  preview.innerHTML = arrowSvg(choice.style, 200, 52, choice.color);
  for (const b of styleBox.children) b.setAttribute('aria-pressed', String(b.dataset.style === choice.style));
  for (const b of swatches.children) b.setAttribute('aria-pressed', String(b.title.toLowerCase() === choice.color.toLowerCase()));
  form.color.value = choice.color.toLowerCase();
}

for (const [id, name] of ARROW_STYLES) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.style = id; b.title = name; b.setAttribute('aria-label', name);
  b.innerHTML = arrowSvg(id, 64, 22, 'currentColor');
  b.addEventListener('click', () => { choice.style = id; renderPreview(); });
  styleBox.appendChild(b);
}
for (const c of ARROW_COLORS) {
  const b = document.createElement('button');
  b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Kleur ' + c);
  b.addEventListener('click', () => { choice.color = c; renderPreview(); });
  swatches.appendChild(b);
}
form.color.addEventListener('input', () => { choice.color = form.color.value; renderPreview(); });
$('arrowCancel').addEventListener('click', () => dlg.close());

export function openArrowDialog(n) {
  current = n;
  choice = { style: n.style, color: n.color };
  renderPreview();
  dlg.showModal();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  try {
    const { note } = await api({ action: 'item_update', id: current.id, style: choice.style, color: choice.color });
    upsert(note);
    dlg.close();
    poll();
  } catch (err) {
    reportError(err);
    dlg.close();
  }
});

defineType('arrow', {
  label: 'Pijl', edit: openArrowDialog, dbl: true, rotatable: true,
  create: () => ({ w: ARROW_DEFAULT_W, h: ARROW_DEFAULT_H, top: 60 }), // 60: ruimte boven de pijl voor het rotatiegreepje
  resize: { mode: 'box', min: ARROW_MIN_W, max: MAX_SIZE, minH: ARROW_MIN_H, maxH: ARROW_MAX_H, fields: ['x', 'y', 'w', 'h'] },
});
