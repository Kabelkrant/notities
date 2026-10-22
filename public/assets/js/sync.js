import { POLL_MS, els, state } from './state.js';
import { dialog, statusEl, setStatus } from './ui.js';
import { applyServerItems, notifyChanged } from './render.js';

// Live sync (polling)
export async function poll() {
  if (document.hidden) return;
  if (state.busy || dialog.open) { state.missedWhileBusy = true; return; }
  try {
    const res = await fetch('api.php?v=' + state.version, { cache: 'no-store' });
    if (res.status === 401) return location.reload();
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.changed) {
      state.version = data.version;
      // focus behouden: appendChild verplaatst elementen en kan de focus kwijtraken
      const focused = document.activeElement?.closest?.('.item');
      applyServerItems(data.notes);
      if (data.folders) { state.folders = data.folders; notifyChanged(); }
      if (focused && els.has(Number(focused.dataset.id)) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }
    state.missedWhileBusy = false;
    if (statusEl.classList.contains('error') && Date.now() > state.statusHoldUntil) setStatus('');
  } catch {
    setStatus('Offline – opnieuw proberen…', true);
  }
}
setInterval(poll, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
dialog.addEventListener('close', () => { if (state.missedWhileBusy) poll(); });
