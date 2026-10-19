import { els, csrf, IMAGE_MAX_DIM, IMAGE_MAX_BYTES } from './state.js';
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

// Drempels voor "te groot" (IMAGE_MAX_DIMENSION en IMAGE_MAX_KB in .env): daarboven vraagt de app of de afbeelding verkleind moet worden.
const MAX_DIM = IMAGE_MAX_DIM, MAX_BYTES = IMAGE_MAX_BYTES;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

const fmtBytes = (n) => (n / 1048576).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' MB';

// Vraagt of een te grote afbeelding verkleind moet worden; true = ja, false = nee/Escape
function askResize(file, size) {
  const dlg = $('resizeDialog');
  const dims = size ? `${size.w} × ${size.h} px, ` : '';
  $('resizeInfo').textContent = `Deze afbeelding is ${dims}${fmtBytes(file.size)}. De grens is ${MAX_DIM} px (langste zijde) en ${fmtBytes(MAX_BYTES)}.`
    + (file.type === 'image/gif' ? ' Bij verkleinen van een GIF gaat de animatie verloren.' : '');
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    $('resizeYes').focus();
  });
}

async function loadSource(file) {
  try { return await createImageBitmap(file); } catch { /* val terug op een img-element */ }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img); img.onerror = () => reject(new Error('Afbeelding kan niet worden verkleind'));
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

// Schaalt naar MAX_DIM en codeert opnieuw tot het onder MAX_BYTES blijft; transparantie blijft behouden (PNG, daarna WebP).
async function shrink(file) {
  const src = await loadSource(file);
  const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
  let scale = Math.min(1, MAX_DIM / Math.max(sw, sh)), best = null;
  const jpeg = file.type === 'image/jpeg';
  const tries = jpeg ? [['image/jpeg', 0.85], ['image/jpeg', 0.7]] : [['image/png'], ['image/webp', 0.85], ['image/webp', 0.7]];
  const finish = () => {
    src.close?.();
    if (!best) throw new Error('Verkleinen mislukt');
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[best.type];
    return new File([best], (file.name || 'afbeelding').replace(/\.[^.]*$/, '') + '.' + ext, { type: best.type });
  };
  for (let round = 0; round < 6; round++) {
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    for (const [type, q] of tries) {
      const blob = await new Promise((r) => canvas.toBlob(r, type, q));
      if (!blob || blob.type !== type) continue;
      best = blob;
      if (blob.size <= MAX_BYTES) return finish();
    }
    scale *= 0.8; // nog te groot: verder verkleinen
  }
  return finish();
}

async function uploadImage(file) {
  try {
    let size = await naturalSize(file);
    if (file.size > MAX_BYTES || (size && Math.max(size.w, size.h) > MAX_DIM)) {
      if (!(await askResize(file, size))) return; // nee: annuleren
      setStatus('Verkleinen…');
      file = await shrink(file);
      size = await naturalSize(file);
    }
    setStatus('Uploaden…');
    const fd = new FormData();
    fd.append('file', file, file.name || 'afbeelding');
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
}

$('imageInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) uploadImage(file);
});

// Ctrl+V met een afbeelding op het klembord (bijv. een schermafbeelding) uploadt die als nieuw item.
// Tijdens een dialoog (notitie bewerken, Over) wordt er niets onderschept.
document.addEventListener('paste', async (e) => {
  if (document.querySelector('dialog[open]')) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => IMAGE_TYPES.includes(f.type));
  if (!files.length) return;
  e.preventDefault();
  for (const f of files) await uploadImage(f);
});
