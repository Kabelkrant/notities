import { els, csrf } from './state.js';
import { $, board, setStatus, reportError } from './ui.js';
import { upsert } from './render.js';
import { freeSpot } from './dialog.js';
import { poll } from './sync.js';

// De browser houdt rekening met EXIF-rotatie, dus meet het formaat daar.
function naturalSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

$('imageInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  setStatus('Uploaden…');
  try {
    const fd = new FormData();
    fd.append('file', file);
    const size = await naturalSize(file);
    if (size) { fd.append('w', size.w); fd.append('h', size.h); }
    const { x, y } = freeSpot();
    fd.append('x', x); fd.append('y', y);
    const res = await fetch('api.php', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || (res.status === 413 ? 'Afbeelding is te groot' : `Fout ${res.status}`));
    upsert(data.note);
    const el = els.get(data.note.id);
    board.appendChild(el);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setStatus('');
    poll();
  } catch (err) {
    reportError(err);
  }
});
