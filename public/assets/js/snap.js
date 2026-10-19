import { GRID, state } from './state.js';
import { $, board } from './ui.js';

// Alleen notities volgen het raster; afbeeldingen blijven vrij te plaatsen.
export const snapTo = (v) => state.snap ? Math.round(v / GRID) * GRID : v;

// Raster alleen tonen terwijl een notitie wordt verplaatst
export const showGrid = (on) => board.classList.toggle('show-grid', on && state.snap);

export function toggleSnap() {
  state.snap = !state.snap;
  board.classList.toggle('snap', state.snap);
  $('snapToggle').setAttribute('aria-checked', String(state.snap));
  document.cookie = `snap=${state.snap ? 1 : 0}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
