import { ZOOM_STEPS, ZOOM_MIN, ZOOM_MAX, GRID, items, els, selected, state } from './state.js';
import { $, board, world } from './ui.js';
import { clearSelection } from './selection.js';

// Camera: de wereld (alle items) staat in één laag die met een transform wordt geschaald en verschoven.
// Scherm = wereld * zoom + (tx, ty). De opmaak van de items blijft daardoor op elk niveau gelijk.
const zoomIn = $('zoomIn'), zoomOut = $('zoomOut');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Zoomen met het wiel: traploos op de cursor, met een veer (lichte overshoot) naar het doel
const WHEEL_K = 0.0018, PINCH_K = 0.01; // gevoeligheid per pixel delta (muiswiel/touchpad, resp. pinch)
const STIFFNESS = 190, DAMPING = 19;    // veer: iets onder kritische demping (2*sqrt(190) = 27,6) voor een zachte overshoot
let goal = state.zoom;                  // doelzoom; tijdens het zoomen hangt de camera aan het ankerpunt
let vel = 0;                            // snelheid van ln(zoom)
let anchor = null;                      // {sx, sy, wx, wy}: scherm- en wereldpunt dat op zijn plek blijft
let slide = null;                       // {tx, ty}: doelverschuiving (bijv. een item in beeld brengen)
let raf = 0, last = 0;

const rect = () => board.getBoundingClientRect();
export const screenToWorld = (cx, cy) => { const r = rect(); return { x: (cx - r.left - state.tx) / state.zoom, y: (cy - r.top - state.ty) / state.zoom }; };
export function visibleWorld() {
  const r = rect();
  return { x0: -state.tx / state.zoom, y0: -state.ty / state.zoom, x1: (r.width - state.tx) / state.zoom, y1: (r.height - state.ty) / state.zoom };
}

function apply() {
  // Alleen de transform van de wereld en directe stijlen op losse elementen: een (overgeërfde) CSS-variabele op het bord zou bij elk frame
  // de stijl van alle items opnieuw laten berekenen, en dat kost bij een groot bord tientallen milliseconden per frame.
  world.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.zoom})`;
  origin.style.transform = `scale(${1 / state.zoom})`; // het ➕ houdt een vaste schermgrootte
  board.style.backgroundSize = `${GRID * state.zoom}px ${GRID * state.zoom}px`; // puntenraster van snap to grid
  board.style.backgroundPosition = `${state.tx}px ${state.ty}px`;
  updateButtons();
  updateBars();
  saveView();
}

function frame(t) {
  raf = 0;
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  let moving = false;
  if (anchor) {
    const x = Math.log(state.zoom), target = Math.log(goal);
    vel += ((target - x) * STIFFNESS - vel * DAMPING) * dt;
    const nz = clamp(Math.exp(x + vel * dt), ZOOM_MIN * 0.97, ZOOM_MAX * 1.03);
    state.zoom = nz;
    state.tx = anchor.sx - anchor.wx * nz;
    state.ty = anchor.sy - anchor.wy * nz;
    if (Math.abs(target - Math.log(nz)) < 2e-4 && Math.abs(vel) < 2e-3) { state.zoom = goal; state.tx = anchor.sx - anchor.wx * goal; state.ty = anchor.sy - anchor.wy * goal; anchor = null; vel = 0; }
    else moving = true;
  }
  if (slide) {
    const f = 1 - Math.exp(-dt * 14);
    state.tx += (slide.tx - state.tx) * f;
    state.ty += (slide.ty - state.ty) * f;
    if (Math.hypot(slide.tx - state.tx, slide.ty - state.ty) < 0.3) { state.tx = slide.tx; state.ty = slide.ty; slide = null; }
    else moving = true;
  }
  if (!moving) { state.tx = Math.round(state.tx); state.ty = Math.round(state.ty); } // in rust op hele pixels: scherpe tekst
  apply();
  if (moving) raf = requestAnimationFrame(frame);
}
function run() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

// Zoom naar `z`, met het scherm- (client-)punt (cx, cy) als vast ankerpunt; standaard het midden van het bord
export function setZoom(z, cx, cy) {
  const r = rect();
  const sx = (cx ?? r.left + r.width / 2) - r.left, sy = (cy ?? r.top + r.height / 2) - r.top;
  goal = clamp(z, ZOOM_MIN, ZOOM_MAX);
  slide = null;
  anchor = { sx, sy, wx: (sx - state.tx) / state.zoom, wy: (sy - state.ty) / state.zoom };
  run();
  updateButtons();
}

export function panBy(dx, dy) {
  // een lopende zoom of schuifbeweging loopt door; het ankerpunt of doel schuift mee
  if (anchor) { anchor.sx += dx; anchor.sy += dy; }
  if (slide) { slide.tx += dx; slide.ty += dy; }
  state.tx += dx; state.ty += dy;
  apply();
}

// Een item (of de wereldrechthoek) geheel in beeld brengen als het buiten het zichtbare deel valt
export function reveal(el, margin = 24) {
  const r = rect(), b = el.getBoundingClientRect();
  let dx = 0, dy = 0;
  if (b.left < r.left + margin) dx = r.left + margin - b.left; else if (b.right > r.right - margin) dx = r.right - margin - b.right;
  if (b.top < r.top + margin) dy = r.top + margin - b.top; else if (b.bottom > r.bottom - margin) dy = r.bottom - margin - b.bottom;
  if (b.width > r.width - 2 * margin) dx = r.left + margin - b.left; // te breed/hoog voor het bord: links/boven uitlijnen
  if (b.height > r.height - 2 * margin) dy = r.top + margin - b.top;
  if (!dx && !dy) return;
  anchor = null; vel = 0; goal = state.zoom;
  slide = { tx: (slide?.tx ?? state.tx) + dx, ty: (slide?.ty ?? state.ty) + dy };
  run();
}

// Het zicht een stuk verschuiven; zacht (de camera loopt er naartoe) of direct (bij kleine, continue stapjes van een touchpad)
function nudge(dx, dy, smooth = true) {
  if (!smooth) return panBy(dx, dy);
  if (anchor) { anchor.sx += dx; anchor.sy += dy; return run(); } // een lopende zoom schuift gewoon mee
  slide = { tx: (slide?.tx ?? state.tx) + dx, ty: (slide?.ty ?? state.ty) + dy };
  run();
}

// Wiel en touchpad: gewoon scrollen verschuift het zicht, zoals scrollen in de browser (het wiel verticaal, Shift+wiel horizontaal, een touchpad
// in alle richtingen). Zoomen gebeurt alleen met Ctrl (of Cmd) ingedrukt, op de cursor. Een pinch op een touchpad komt binnen als wiel met Ctrl en zoomt dus ook.
board.addEventListener('wheel', (e) => {
  e.preventDefault(); // anders kan een horizontale veeg 'terug' in de browsergeschiedenis geven, en zoomt Ctrl+wiel de hele pagina
  if (state.busy || pinch.active) return; // niet tijdens slepen, schalen of roteren van een item: de muis zou van het item losraken
  const unit = e.deltaMode === 1 ? 19 : e.deltaMode === 2 ? rect().height : 1; // regels en pagina's omrekenen naar pixels
  if (e.ctrlKey || e.metaKey) {
    const d = clamp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1), -160, 160);
    const isPinch = e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaY) < 20; // een echte pinch geeft kleine pixel-delta's; een wielstap (ook in regels, Firefox) heeft de gewone wielsnelheid
    setZoom(goal * Math.exp(-d * (isPinch ? PINCH_K : WHEEL_K)), e.clientX, e.clientY);
    return;
  }
  let dx = e.deltaX * unit, dy = e.deltaY * unit;
  if (e.shiftKey && !dx) { dx = dy; dy = 0; } // Shift+wiel: horizontaal, zoals in de browser
  nudge(-dx, -dy, e.deltaMode !== 0 || Math.abs(dx) + Math.abs(dy) >= 50); // wielstappen zacht, touchpad direct
}, { passive: false });

// Pinch op een touchscreen: twee vingers (ook boven items) zoomen rechtstreeks mee met de afstand, en pannen met het midden ertussen.
// Zodra de tweede vinger neerkomt zijn slepen en pannen met één vinger uit; drag.js kijkt naar pinch.active.
export const pinch = { active: false };
const touches = new Map(); // pointerId -> {x, y}
let pz = null;             // {z0, d0, wx, wy}: zoom, afstand en wereldpunt bij het begin
const pair = () => { const [a, b] = [...touches.values()]; return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
board.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size !== 2) return;
  const { cx, cy, d } = pair(), w = screenToWorld(cx, cy);
  anchor = slide = null; vel = 0; pan = null;
  board.classList.remove('panning');
  pinch.active = true; state.busy = true;
  pz = { z0: state.zoom, d0: d, wx: w.x, wy: w.y };
}, true);
board.addEventListener('pointermove', (e) => {
  const t = touches.get(e.pointerId);
  if (!t) return;
  t.x = e.clientX; t.y = e.clientY;
  if (!pinch.active || touches.size !== 2) return;
  const { cx, cy, d } = pair(), r = rect();
  state.zoom = goal = clamp(pz.z0 * d / pz.d0, ZOOM_MIN, ZOOM_MAX);
  state.tx = cx - r.left - pz.wx * state.zoom;
  state.ty = cy - r.top - pz.wy * state.zoom;
  apply();
}, true);
function endTouch(e) {
  if (!touches.delete(e.pointerId) || !pinch.active || touches.size >= 2) return;
  pinch.active = false; state.busy = false; pz = null;
  state.tx = Math.round(state.tx); state.ty = Math.round(state.ty);
  apply();
}
board.addEventListener('pointerup', endTouch, true);
board.addEventListener('pointercancel', endTouch, true);

// Pannen: slepen op leeg bord. Het handje verschijnt pas zodra er echt gesleept wordt. (De middelste muisknop doet iets anders: zie verderop.)
// Een item moet eerst gekozen zijn (aangeklikt of aangetikt, of geselecteerd met Ctrl) voordat je het kunt verslepen, zie drag.js:
// slepen vanaf een niet-gekozen item pant het bord, en een klik of tik zonder slepen kiest het item. Zo schuif je niet per ongeluk
// een item weg terwijl je het bord wilde verschuiven of scrollen.
let pan = null;
// gekozen = gefocust, of onderdeel van de selectie
export const isChosen = (item) => item.matches(':focus-within') || selected.has(Number(item.dataset.id));
board.addEventListener('pointerdown', (e) => {
  const item = e.target.closest?.('.item');
  const touch = e.pointerType === 'touch';
  const select = e.ctrlKey || e.metaKey; // Ctrl+klik op een item zet het in de selectie (drag.js), dat is geen pan of tik
  const touchPan = !select && item && !e.target.closest('button, a, .rotate-handle, .resize-handle')
    && (!isChosen(item) || (touch && item.classList.contains('note') && !e.target.closest('.note-head'))); // op touch pant ook de tekst van een gekozen notitie
  if (pinch.active || !(e.button === 0 && (e.target === board || touchPan))) return;
  pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, tap: touchPan ? item : null };
  board.setPointerCapture(e.pointerId);
  if (!touchPan) document.activeElement?.blur?.(); // preventDefault houdt de browser anders van het wegklikken van de focus af
  e.preventDefault();
});
board.addEventListener('pointermove', (e) => {
  if (!pan || e.pointerId !== pan.id || pinch.active) return;
  if (!pan.moved) {
    if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) < 4) return;
    pan.moved = true;
    board.classList.add('panning');
  }
  panBy(e.clientX - pan.x, e.clientY - pan.y);
  pan.x = e.clientX; pan.y = e.clientY;
});
function endPan(e) {
  if (!pan || e.pointerId !== pan.id) return;
  if (pan.tap && !pan.moved && e.type === 'pointerup') { clearSelection(); pan.tap.focus({ preventScroll: true }); } // een klik of tik kiest het item
  pan = null;
  board.classList.remove('panning');
  state.tx = Math.round(state.tx); state.ty = Math.round(state.ty);
  apply();
}
board.addEventListener('pointerup', endPan);
board.addEventListener('pointercancel', endPan);

// Middelste muisknop ingedrukt houden: het zicht blijft bewegen in de richting van de muis ten opzichte van het punt waar je indrukte,
// des te sneller naarmate je verder weg gaat (zoals de automatische scroll van een browser). Loslaten stopt het.
const AUTO_DEAD = 10, AUTO_GAIN = 5, AUTO_MAX = 3000; // dode zone (px), px/s per px afstand, maximale snelheid (px/s)
let auto = null, autoRaf = 0;
function autoFrame(t) {
  autoRaf = 0;
  if (!auto) return;
  const dt = Math.min(0.05, (t - auto.t) / 1000 || 0.016); auto.t = t;
  const speed = (d) => Math.sign(d) * Math.min(AUTO_MAX, Math.max(0, Math.abs(d) - AUTO_DEAD) * AUTO_GAIN);
  const vx = speed(auto.x - auto.sx), vy = speed(auto.y - auto.sy);
  if (vx || vy) panBy(-vx * dt, -vy * dt); // het zicht gaat mee met de muis, de inhoud de andere kant op
  autoRaf = requestAnimationFrame(autoFrame);
}
function endAuto(e) {
  if (!auto || (e && e.pointerId !== auto.id)) return;
  auto.ring.remove(); auto = null;
  board.classList.remove('autoscrolling');
  state.tx = Math.round(state.tx); state.ty = Math.round(state.ty);
  apply();
}
board.addEventListener('pointerdown', (e) => {
  if (e.button !== 1 || auto || pinch.active) return;
  const r = rect(), ring = document.createElement('div');
  ring.className = 'autoscroll-ring'; ring.style.left = e.clientX - r.left + 'px'; ring.style.top = e.clientY - r.top + 'px';
  board.appendChild(ring);
  auto = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), ring };
  board.classList.add('autoscrolling');
  board.setPointerCapture(e.pointerId);
  anchor = slide = null; vel = 0; goal = state.zoom;
  document.activeElement?.blur?.();
  e.preventDefault();
  autoRaf = requestAnimationFrame(autoFrame);
});
board.addEventListener('pointermove', (e) => { if (auto && e.pointerId === auto.id) { auto.x = e.clientX; auto.y = e.clientY; } });
board.addEventListener('pointerup', (e) => { if (e.button === 1) endAuto(e); });
board.addEventListener('pointercancel', endAuto);
board.addEventListener('lostpointercapture', endAuto);
addEventListener('blur', () => endAuto());

// Pijltjestoetsen: het bord verschuiven (Shift = grotere stap). Alleen als er geen item gefocust of geselecteerd is
// (die verplaatsen met de pijltjes, zie actions.js) en je niet in een invoerveld, knop of dialoog zit.
const KEY_STEP = 80, KEY_STEP_BIG = 320;
addEventListener('keydown', (e) => {
  if (state.mode === 'notes' || !e.key.startsWith('Arrow') || e.ctrlKey || e.metaKey || e.altKey || selected.size) return;
  if (e.target.closest?.('.item, input, textarea, select, button, [contenteditable]') || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
  // de inhoud schuift tegen de pijl in: pijl rechts brengt het zicht naar rechts
  const dx = e.key === 'ArrowRight' ? -step : e.key === 'ArrowLeft' ? step : 0, dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
  if (pinch.active) return;
  nudge(dx, dy);
});

// Een item dat via Tab focus krijgt maar buiten beeld staat, schuift in beeld
board.addEventListener('focusin', (e) => { const it = e.target.closest?.('.item'); if (it && e.target.matches(':focus-visible')) reveal(it); });
board.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // geen autoscroll-cirkel van de browser

// Zoomniveau en positie in een cookie (een jaar); de server leest het mee om direct op het juiste zicht te laden.
let saveTimer = 0;
function saveView() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const v = [state.zoom.toFixed(4), Math.round(state.tx), Math.round(state.ty)].join(',');
    document.cookie = `view=${v}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }, 400);
}

// Knoppen: één stap in of uit, ten opzichte van het doel
function updateButtons() {
  const pct = Math.round(goal * 100) + '%';
  zoomOut.disabled = goal <= ZOOM_STEPS[0] + 1e-9;
  zoomIn.disabled = goal >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 1e-9;
  zoomOut.title = `Uitzoomen (nu ${pct})`;
  zoomIn.title = `Inzoomen (nu ${pct})`;
}
const stepOut = () => setZoom([...ZOOM_STEPS].reverse().find((z) => z < goal * 0.999) ?? ZOOM_MIN);
const stepIn = () => setZoom(ZOOM_STEPS.find((z) => z > goal * 1.001) ?? ZOOM_MAX);
zoomOut.addEventListener('click', stepOut);
zoomIn.addEventListener('click', stepIn);
// Toetsen + en - (ook = en de numerieke toetsen): zoom ×1,5 of ÷1,5, om het midden van het bord
addEventListener('keydown', (e) => {
  const inn = e.key === '+' || e.key === '=', out = e.key === '-' || e.key === '_';
  if (state.mode === 'notes' || !(inn || out) || e.ctrlKey || e.metaKey || e.altKey || pinch.active) return; // Ctrl en + / - blijft de zoom van de browser
  if (e.target.closest?.('input, textarea, select, button, [contenteditable]') || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  setZoom(goal * (inn ? 1.5 : 1 / 1.5));
});

// Oorsprong (0, 0): een ➕ met een vaste schermgrootte; aanklikken toont een uitleg
const origin = document.createElement('button');
origin.type = 'button';
origin.className = 'origin';
origin.setAttribute('aria-label', 'Middenpunt van het bord (0, 0)');
origin.innerHTML = '<span class="origin-icon" aria-hidden="true">➕</span><span class="origin-tip" role="status" hidden>Dit is het middenpunt (0, 0) van het bord</span>';
world.prepend(origin);
const tip = origin.querySelector('.origin-tip');
let tipTimer = 0;
const hideTip = () => { clearTimeout(tipTimer); tip.hidden = true; };
origin.addEventListener('click', () => {
  hideTip();
  tip.hidden = false;
  tipTimer = setTimeout(hideTip, 3500);
});
board.addEventListener('pointerdown', (e) => { if (!e.target.closest('.origin')) hideTip(); });

// Scrollbalken: de schaal volgt de buitenste objecten (plus de oorsprong); buiten de inhoud schuiven groeit de schaal mee
const bars = { x: makeBar('x'), y: makeBar('y') };
let barDrag = null, barQueued = false;
function makeBar(axis) {
  const track = document.createElement('div'), thumb = document.createElement('div');
  track.className = 'bar bar-' + axis; thumb.className = 'bar-thumb';
  track.appendChild(thumb); board.appendChild(track);
  track.addEventListener('pointerdown', (e) => barDown(e, axis, track, thumb));
  track.addEventListener('pointermove', (e) => barMove(e, axis));
  const done = () => { if (!barDrag) return; barDrag = null; state.tx = Math.round(state.tx); state.ty = Math.round(state.ty); apply(); };
  track.addEventListener('pointerup', done);
  track.addEventListener('pointercancel', done);
  return { track, thumb };
}

function contentExtent() {
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0; // de oorsprong hoort er altijd bij
  for (const [id, n] of items) {
    const el = els.get(id);
    if (!el || el.hidden) continue;
    const w = el.offsetWidth || n.w || 0, h = el.offsetHeight || n.h || 0;
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
  }
  return { x0, y0, x1, y1 };
}

function updateBars() {
  if (barDrag) return; // tijdens het slepen van een balk staat de schaal vast
  barQueued = false;
  const e = contentExtent(), v = visibleWorld();
  layoutBar('x', Math.min(e.x0, v.x0), Math.max(e.x1, v.x1), v.x0, v.x1);
  layoutBar('y', Math.min(e.y0, v.y0), Math.max(e.y1, v.y1), v.y0, v.y1);
}
function layoutBar(axis, lo, hi, v0, v1) {
  const { track, thumb } = bars[axis], span = hi - lo, size = (v1 - v0) / span;
  track.hidden = size > 0.999; // alles is in beeld
  track._range = { lo, hi };
  const a = axis === 'x' ? ['left', 'width'] : ['top', 'height'];
  thumb.style[a[0]] = (v0 - lo) / span * 100 + '%';
  thumb.style[a[1]] = size * 100 + '%';
}
// Andere modules melden dat items zijn veranderd (verplaatst, bijgewerkt, verwijderd)
export function refreshBars() { if (!barQueued) { barQueued = true; requestAnimationFrame(updateBars); } }

function barDown(e, axis, track, thumb) {
  if (e.button !== 0) return;
  e.preventDefault();
  const len = axis === 'x' ? track.clientWidth : track.clientHeight, { lo, hi } = track._range, v = visibleWorld();
  const pos = axis === 'x' ? e.clientX - track.getBoundingClientRect().left : e.clientY - track.getBoundingClientRect().top;
  if (e.target !== thumb) { // naast de duim klikken: het bord schuift zo dat dat punt in het midden komt
    const centre = lo + pos / len * (hi - lo), half = ((axis === 'x' ? v.x1 - v.x0 : v.y1 - v.y0)) / 2;
    anchor = null; vel = 0; goal = state.zoom;
    slide = axis === 'x' ? { tx: -(centre - half) * state.zoom, ty: state.ty } : { tx: state.tx, ty: -(centre - half) * state.zoom };
    run();
    return;
  }
  barDrag = { axis, start: pos, v0: axis === 'x' ? v.x0 : v.y0, lo, hi, len, vsize: axis === 'x' ? v.x1 - v.x0 : v.y1 - v.y0, rt: track.getBoundingClientRect() };
  track.setPointerCapture(e.pointerId);
}
function barMove(e, axis) {
  if (!barDrag || barDrag.axis !== axis) return;
  const b = barDrag, pos = axis === 'x' ? e.clientX - b.rt.left : e.clientY - b.rt.top;
  const v0 = clamp(b.v0 + (pos - b.start) / b.len * (b.hi - b.lo), b.lo, b.hi - b.vsize);
  anchor = slide = null; vel = 0; goal = state.zoom;
  if (axis === 'x') state.tx = -v0 * state.zoom; else state.ty = -v0 * state.zoom;
  apply(); // tijdens het slepen staat de schaal vast (updateBars slaat over); alleen de duim loopt mee
  const span = b.hi - b.lo, th = bars[axis].thumb;
  th.style[axis === 'x' ? 'left' : 'top'] = (v0 - b.lo) / span * 100 + '%';
}

apply();
