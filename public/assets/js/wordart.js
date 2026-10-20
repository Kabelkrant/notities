import { els, items } from './state.js';
import { $, board, reportError } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { freeSpot } from './dialog.js';
import { WORDART_STYLES, WORDART_SHAPES, WORDART_DEFAULT_W, WORDART_MAX_TEXT, wordartMarkup, wordartRatio } from './wordartshape.js';

// Nieuw WordArt-item op een vrije plek
export async function createWordart() {
  try {
    const h = Math.round(WORDART_DEFAULT_W * wordartRatio('WordArt', 'straight'));
    const { x, y } = freeSpot(WORDART_DEFAULT_W, h, 60); // 60: ruimte boven voor het rotatiegreepje
    const { note } = await api({ action: 'create_wordart', x, y, w: WORDART_DEFAULT_W, h });
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

// Dialoog: tekst, stijl en vorm met live voorbeeld
const dlg = $('wordartDialog'), form = $('wordartForm'), preview = $('wordartPreview'), styleBox = $('wordartStyles'), shapeBox = $('wordartShapes'), errBox = $('wordartError');
let current = null, choice = null;

function renderPreview() {
  preview.innerHTML = wordartMarkup({ ...choice, text: choice.text.trim() || 'WordArt' });
  for (const b of styleBox.children) b.setAttribute('aria-pressed', String(b.dataset.style === choice.style));
  for (const b of shapeBox.children) b.setAttribute('aria-pressed', String(b.dataset.shape === choice.shape));
}

for (const [id, name] of WORDART_STYLES) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.style = id; b.title = name; b.setAttribute('aria-label', name);
  b.innerHTML = wordartMarkup({ text: 'Abc', style: id, shape: 'straight' });
  b.addEventListener('click', () => { choice.style = id; renderPreview(); });
  styleBox.appendChild(b);
}
for (const [id, name] of WORDART_SHAPES) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.shape = id; b.title = name; b.setAttribute('aria-label', name);
  b.innerHTML = wordartMarkup({ text: 'Abc', style: 'chrome', shape: id });
  b.addEventListener('click', () => { choice.shape = id; renderPreview(); });
  shapeBox.appendChild(b);
}
form.text.maxLength = WORDART_MAX_TEXT;
form.text.addEventListener('input', () => { choice.text = form.text.value; errBox.hidden = true; renderPreview(); });
$('wordartCancel').addEventListener('click', () => dlg.close());

export function openWordartDialog(n) {
  current = n;
  choice = { text: n.text, style: n.style, shape: n.shape };
  form.text.value = n.text;
  errBox.hidden = true;
  renderPreview();
  dlg.showModal();
  form.text.focus(); form.text.select();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const text = form.text.value.trim();
  if (!text) { errBox.textContent = 'Vul een tekst in'; errBox.hidden = false; form.text.focus(); return; }
  try {
    // verandert de tekst of vorm, dan volgt de hoogte de nieuwe tekening; een zelf gekozen uitrekking blijft behouden
    const stretch = current.h / (current.w * wordartRatio(current.text, current.shape)) || 1;
    const h = Math.round(current.w * wordartRatio(text, choice.shape) * stretch);
    const { note } = await api({ action: 'wordart_update', id: current.id, text, style: choice.style, shape: choice.shape, h });
    upsert(note);
    dlg.close();
    poll();
  } catch (err) {
    errBox.textContent = err.message; errBox.hidden = false;
  }
});
