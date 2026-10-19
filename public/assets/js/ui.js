import { state } from './state.js';

export const $ = (id) => document.getElementById(id);
export const board = $('board'), dialog = $('noteDialog'), form = $('noteForm');
export const statusEl = $('status'), toast = $('toast');

export function setStatus(text, isError = false, holdMs = 0) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
  state.statusHoldUntil = Date.now() + holdMs;
}
export const reportError = (err) => setStatus(err.message, true, 6000);

let toastUndo = null;
export function showToast(text, onUndo) {
  $('toastText').textContent = text; toastUndo = onUndo; toast.hidden = false;
}
export function hideToast() { toast.hidden = true; toastUndo = null; }
$('toastAction').addEventListener('click', () => { toastUndo?.(); hideToast(); });
