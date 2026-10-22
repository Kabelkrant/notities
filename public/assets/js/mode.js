import { state } from './state.js';
import { $, board } from './ui.js';

// Weergavemodus: 'canvas' (het bord) of 'notes' (notitie-app). Wisselen kan in het menu (radioknoppen); de keuze staat in de cookie 'mode',
// zodat de server de pagina meteen goed opbouwt. Het canvas blijft op de achtergrond bestaan (onzichtbaar en niet bedienbaar).
const app = $('notesApp'), radios = [...document.querySelectorAll('#mainMenu [data-mode]')];

function apply() {
  const notes = state.mode === 'notes';
  document.body.classList.toggle('mode-notes', notes);
  document.body.classList.toggle('mode-canvas', !notes);
  app.hidden = !notes;
  board.inert = notes; // geen focus of toetsenbord op het onzichtbare canvas
  for (const r of radios) r.setAttribute('aria-checked', String(r.dataset.mode === state.mode));
}

export function setMode(mode) {
  if (mode === state.mode) return;
  window.dispatchEvent(new Event('mode:leaving')); // de notitie-app slaat nog niet bewaarde wijzigingen op
  state.mode = mode;
  document.cookie = `mode=${mode}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  apply();
  window.dispatchEvent(new Event('mode:changed'));
}

for (const r of radios) r.addEventListener('click', () => {
  setMode(r.dataset.mode);
  $('mainBtn').click(); // sluit het menu
  $('mainBtn').focus();
});
apply();
