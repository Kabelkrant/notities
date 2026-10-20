import { els } from './state.js';
import { board, reportError } from './ui.js';
import { api } from './api.js';
import { upsert } from './render.js';
import { poll } from './sync.js';
import { freeSpot } from './dialog.js';
import { TYPES } from './types.js';

// Nieuw item van dit type op een vrije plek (menu + → ...)
export async function createItem(type) {
  try {
    const { w, h = w, top } = TYPES[type].create();
    const { x, y } = freeSpot(w, h, top);
    const { note } = await api({ action: 'create_item', type, x, y, w, h });
    upsert(note);
    const el = els.get(note.id);
    board.appendChild(el);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    el.focus({ preventScroll: true }); // zo zijn de greepjes meteen zichtbaar
    poll();
  } catch (err) {
    reportError(err);
  }
}
