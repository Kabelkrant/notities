import { items, els, pendingDelete, selected, hiddenIds, TRASH } from './state.js';
import { world } from './ui.js';
import { refreshBars } from './zoom.js';
import { needsLightText } from './color.js';
import { shapeSvg, fitText } from './shapeshape.js';
import { clockMarkup, updateClock, timeIn } from './clockshape.js';
import { countdownMarkup, updateCountdown, secondsLeft } from './countdownshape.js';
import { wordartMarkup, wordartRatio } from './wordartshape.js';

const sig = (n) => [n.type, n.title, n.body, n.color, n.file, n.x, n.y, n.w, n.h, n.rot, n.style, n.tz, n.label, n.seconds, n.text, n.shape, n.target, n.showDate, n.kind, n.strokeOn, n.strokeColor, n.strokeW, n.fillOn, n.fillColor, n.fillTransp, n.textColor, n.textSize, n.order, n.folder, n.updated].join('\u0001');

function buildItem(n) {
  const el = document.createElement(n.type === 'image' ? 'figure' : 'article');
  el.tabIndex = 0;
  el.dataset.id = n.id;
  if (n.type === 'wordart') {
    el.className = 'item wordart';
    el.innerHTML = `
      <div class="wordart-art"></div>
      <span class="rotate-handle" aria-hidden="true" title="Roteren (Shift = stappen van 15°)"></span>
      <span class="resize-handle" aria-hidden="true"></span>
      <div class="wordart-actions">
        <button type="button" class="edit-btn" title="Tekst, stijl en vorm" aria-label="Tekst, stijl en vorm">✏️</button>
        <button type="button" class="delete-btn" title="Verwijderen" aria-label="Verwijderen">🗑️</button>
      </div>`;
  } else if (n.type === 'countdown') {
    el.className = 'item countdown';
    el.setAttribute('role', 'img');
    el.innerHTML = `
      <div class="countdown-art"></div>
      <span class="resize-handle" aria-hidden="true"></span>
      <div class="countdown-actions">
        <button type="button" class="edit-btn" title="Ontwerp, label en datum" aria-label="Ontwerp, label en datum">✏️</button>
        <button type="button" class="delete-btn" title="Verwijderen" aria-label="Verwijderen">🗑️</button>
      </div>`;
  } else if (n.type === 'clock') {
    el.className = 'item clock';
    el.setAttribute('aria-label', 'Klok');
    el.setAttribute('role', 'img');
    el.innerHTML = `
      <div class="clock-art"></div>
      <span class="resize-handle" aria-hidden="true"></span>
      <div class="clock-actions">
        <button type="button" class="edit-btn" title="Stijl, tijdzone en label" aria-label="Stijl, tijdzone en label">✏️</button>
        <button type="button" class="delete-btn" title="Verwijderen" aria-label="Verwijderen">🗑️</button>
      </div>`;
  } else if (n.type === 'shape') {
    el.className = 'item shape';
    el.innerHTML = `
      <div class="shape-art"></div>
      <div class="shape-text"><span></span></div>
      <span class="rotate-handle" aria-hidden="true" title="Roteren (Shift = stappen van 15°)"></span>
      <span class="resize-handle" aria-hidden="true"></span>
      <div class="shape-actions">
        <button type="button" class="edit-btn" title="Vorm, kleuren en tekst" aria-label="Vorm, kleuren en tekst">✏️</button>
        <button type="button" class="delete-btn" title="Verwijderen" aria-label="Verwijderen">🗑️</button>
      </div>`;
  } else if (n.type === 'image') {
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
  refreshBars();
  el.style.left = n.x + 'px';
  el.style.top = n.y + 'px';
  if (n.type === 'wordart') {
    if (!n.h) n.h = Math.max(1, Math.round(n.w * wordartRatio(n.text, n.shape))); // oudere items zonder hoogte: natuurlijke verhouding van de tekening
    el.style.width = n.w + 'px';
    el.style.height = n.h + 'px';
    el.style.setProperty('--rot', n.rot || 0);
    el.setAttribute('aria-label', 'WordArt: ' + n.text);
    const art = el.querySelector('.wordart-art'), sig = [n.text, n.style, n.shape].join('\u0001');
    if (art._sig !== sig) { art._sig = sig; art.innerHTML = wordartMarkup(n); }
    return;
  }
  if (n.type === 'countdown') {
    el.style.width = n.w + 'px';
    el.style.height = n.w + 'px';
    const art = el.querySelector('.countdown-art'), sig = [n.style, n.label, n.showDate, n.target].join('\u0001');
    if (art._sig !== sig) { art._sig = sig; art.innerHTML = countdownMarkup(n); art._c = {}; }
    art._c = {}; // aria-label en klassen na elke wijziging opnieuw zetten
    updateCountdown(art, n, secondsLeft(n));
    return;
  }
  if (n.type === 'clock') {
    el.style.width = n.w + 'px';
    el.style.height = n.w + 'px';
    el.dataset.style = n.style;
    const art = el.querySelector('.clock-art'), sig = [n.style, n.tz, n.label, n.seconds].join('\u0001');
    if (art._sig !== sig) { // de tekening hangt niet van de grootte af (viewBox); alleen opnieuw bij andere instellingen
      art._sig = sig;
      art.innerHTML = clockMarkup(n);
      art._c = {};
    }
    updateClock(art, n, timeIn(n.tz, new Date()));
    return;
  }
  if (n.type === 'shape') {
    el.style.width = n.w + 'px';
    el.style.height = n.h + 'px';
    el.style.setProperty('--rot', n.rot || 0);
    el.dataset.kind = n.kind;
    el.setAttribute('aria-label', n.text ? 'Vorm: ' + n.text : 'Vorm');
    el.querySelector('.shape-art').innerHTML = shapeSvg(n, n.w, n.h);
    const t = el.querySelector('.shape-text'), fit = [n.text, n.textSize, n.w, n.h, n.kind].join('\u0001');
    t.style.color = n.textColor;
    if (t._fit !== fit) { // de tekst krimpt mee als hij niet past; alleen opnieuw meten bij een andere tekst, grootte of vorm
      t._fit = fit;
      t.firstElementChild.textContent = n.text;
      fitText(t, n.textSize);
    }
    return;
  }
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
  for (const a of body.querySelectorAll('a')) {
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    const href = a.getAttribute('href') || '';
    // eigen linktekst: toon het echte adres als tooltip (automatische links tonen het adres al)
    if (a.textContent !== href && a.textContent !== href.replace(/^https?:\/\//i, '')) a.title = href;
  }
}

// Meldt de notitie-app dat er items zijn gewijzigd (die tekent zijn lijst opnieuw)
export const notifyChanged = () => window.dispatchEvent(new Event('notes:changed'));

export function upsert(n) {
  items.set(n.id, n);
  let el = els.get(n.id);
  if (n.type === 'note' && n.folder === TRASH) { // notities in de Prullenbak staan niet op het canvas
    if (el) { el.remove(); els.delete(n.id); selected.delete(n.id); refreshBars(); }
    notifyChanged();
    return;
  }
  if (!el) {
    el = buildItem(n);
    els.set(n.id, el);
    world.appendChild(el);
  }
  paint(el, n);
  notifyChanged();
}

export function remove(id) {
  items.delete(id);
  hiddenIds.delete(id);
  selected.delete(id);
  els.get(id)?.remove();
  els.delete(id);
  refreshBars();
  notifyChanged();
}

export function applyServerItems(list) {
  const seen = new Set();
  for (const n of list) {
    if (pendingDelete.has(n.id)) continue;
    seen.add(n.id);
    const old = items.get(n.id);
    if (!old || sig(old) !== sig(n)) upsert(n);
    const el = els.get(n.id);
    if (el) world.appendChild(el); // volgorde = laatst gewijzigd bovenaan (notities in de Prullenbak hebben geen element)
  }
  for (const id of [...items.keys()]) if (!seen.has(id) && !pendingDelete.has(id)) remove(id);
}
