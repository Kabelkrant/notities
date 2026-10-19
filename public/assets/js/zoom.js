import { ZOOM_STEPS, state } from './state.js';
import { $, board } from './ui.js';

const zoomIn = $('zoomIn'), zoomOut = $('zoomOut');

// Zoomniveau in een cookie (een jaar); de server leest het mee om direct op het juiste niveau te laden.
function saveCookie(z) {
  document.cookie = `zoom=${z}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

// Dichtstbijzijnde stap voor een eventueel afwijkende cookiewaarde
const stepIndex = () => ZOOM_STEPS.reduce((best, z, i) => Math.abs(z - state.zoom) < Math.abs(ZOOM_STEPS[best] - state.zoom) ? i : best, 0);

export function setZoom(z) {
  // houd het midden van het zichtbare deel op dezelfde plek
  const cx = board.clientWidth / 2, cy = board.clientHeight / 2, r = z / state.zoom;
  const left = (board.scrollLeft + cx) * r - cx, top = (board.scrollTop + cy) * r - cy;
  state.zoom = z;
  board.style.setProperty('--zoom', z);
  board.scrollLeft = left; board.scrollTop = top;
  saveCookie(z);
  update();
}

function update() {
  const i = stepIndex();
  zoomOut.disabled = i === 0;
  zoomIn.disabled = i === ZOOM_STEPS.length - 1;
  const pct = Math.round(state.zoom * 100) + '%';
  zoomOut.title = `Uitzoomen (nu ${pct})`;
  zoomIn.title = `Inzoomen (nu ${pct})`;
}

zoomOut.addEventListener('click', () => setZoom(ZOOM_STEPS[Math.max(0, stepIndex() - 1)]));
zoomIn.addEventListener('click', () => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, stepIndex() + 1)]));
update();
