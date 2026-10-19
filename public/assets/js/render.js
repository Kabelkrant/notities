import { items, els, pendingDelete } from './state.js';
import { board } from './ui.js';
import { needsLightText } from './color.js';

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

export function paint(el, n) {
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
  const body = el.querySelector('.body-text');
  body.innerHTML = n.html;
  for (const a of body.querySelectorAll('a')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
}

export function upsert(n) {
  items.set(n.id, n);
  let el = els.get(n.id);
  if (!el) {
    el = buildItem(n);
    els.set(n.id, el);
    board.appendChild(el);
  }
  paint(el, n);
}

export function remove(id) {
  items.delete(id);
  els.get(id)?.remove();
  els.delete(id);
}

export function applyServerItems(list) {
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
