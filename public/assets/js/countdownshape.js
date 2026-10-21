// Tekent de afteltimer (naar een streefdatum) als SVG in vier skins en werkt de getallen bij.
// Altijd twee eenheden: dagen+uren, uren+minuten of minuten+seconden.
export const COUNTDOWN_STYLES = [['classic', 'Klassiek'], ['digital', 'Digitaal'], ['flip', 'Omklap'], ['color', 'Kleurrijk'], ['chalk', 'Krijtbord']];
export const COUNTDOWN_DEFAULT_SIZE = 200, COUNTDOWN_MIN_SIZE = 120, COUNTDOWN_MAX_SIZE = 600, COUNTDOWN_MAX_LABEL = 40;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHALK = "'Bradley Hand', 'Segoe Print', 'Chalkboard SE', 'Comic Sans MS', cursive", SANS = "'Segoe UI', Arial, sans-serif", MONO = "'Courier New', Courier, monospace";
const r2 = (v) => Math.round(v * 100) / 100;
let uidCounter = 0;

/* ---------- Resterende tijd ---------- */
// [[aantal, enkelvoud, meervoud], [aantal, enkelvoud, meervoud]] voor `s` resterende seconden (afgerond naar boven)
export function countdownParts(s) {
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  if (d >= 1) return [[d, 'dag', 'dagen'], [h, 'uur', 'uur']];
  if (h >= 1) return [[h, 'uur', 'uur'], [m, 'minuut', 'minuten']];
  return [[m, 'minuut', 'minuten'], [sec, 'seconde', 'seconden']];
}
export const secondsLeft = (n, nowMs = Date.now()) => Math.ceil(n.target - nowMs / 1000);

/* ---------- Skins ---------- */
const SKINS = {
  classic: { label: '#1d2433', nog: '#7a8497', num: '#111827', unit: '#5b6577', font: SANS, weight: 700 },
  digital: { label: '#8dffab', nog: '#4fbf6c', num: '#5dff8a', unit: '#4fbf6c', font: MONO, weight: 700 },
  flip: { label: '#f1f1f4', nog: '#9a9ca6', num: '#f6f6f8', unit: '#9a9ca6', font: SANS, weight: 700, tiles: true },
  chalk: { label: '#fffdf2', nog: '#d9d6c4', num: '#fffdf2', unit: '#d9d6c4', font: CHALK, ui: CHALK, weight: 700, numScale: 0.86 },
  color: { label: '#ffffff', nog: 'rgba(255,255,255,.82)', num: '#ffffff', unit: 'rgba(255,255,255,.88)', font: SANS, weight: 800 },
};

function background(style, id) {
  switch (style) {
    case 'digital':
      return `<defs><linearGradient id="${id('bg')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262b27"/><stop offset="1" stop-color="#060806"/></linearGradient></defs>
        <rect x="3" y="3" width="194" height="194" rx="30" fill="url(#${id('bg')})" stroke="#4a4f4b" stroke-width="1.5"/>
        <rect x="9" y="9" width="182" height="182" rx="25" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="2"/>`;
    case 'chalk':
      return `<defs><radialGradient id="${id('bg')}" cx=".4" cy=".35" r=".9"><stop offset="0" stop-color="#3b5d49"/><stop offset="1" stop-color="#22382c"/></radialGradient>
        <linearGradient id="${id('wood')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b98652"/><stop offset="1" stop-color="#6e4723"/></linearGradient></defs>
        <rect x="2" y="2" width="196" height="196" rx="26" fill="url(#${id('wood')})"/>
        <rect x="11" y="11" width="178" height="178" rx="17" fill="url(#${id('bg')})" stroke="#1a2a20" stroke-width="2"/>
        <path d="M30,186 q40,-4 80,-1 t60,-1" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="5" stroke-linecap="round"/>`;
    case 'flip':
      return `<rect x="2" y="2" width="196" height="196" rx="30" fill="#1c1d21" stroke="#0a0a0c" stroke-width="2"/>`;
    case 'color':
      return `<defs><linearGradient id="${id('bg')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset=".55" stop-color="#c13584"/><stop offset="1" stop-color="#5b51d8"/></linearGradient>
        <clipPath id="${id('clip')}"><rect x="2" y="2" width="196" height="196" rx="30"/></clipPath></defs>
        <rect x="2" y="2" width="196" height="196" rx="30" fill="url(#${id('bg')})"/>
        <g clip-path="url(#${id('clip')})" fill="#fff" fill-opacity=".1"><circle cx="190" cy="14" r="70"/><circle cx="10" cy="196" r="56"/></g>`;
    default:
      return `<defs><linearGradient id="${id('bg')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6eaf1"/></linearGradient></defs>
        <rect x="2" y="2" width="196" height="196" rx="30" fill="url(#${id('bg')})" stroke="#c9d0dc" stroke-width="2"/>`;
  }
}

// "wo 21 okt 14:30" (met jaartal als het niet dit jaar is), in de tijdzone van dit apparaat
function dateText(target) {
  const d = new Date(target * 1000), opts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleString('nl-NL', opts).replace(/\./g, '').replace(',', '');
}

export function countdownMarkup(n) {
  const uid = `d${++uidCounter}_`, id = (k) => uid + k, k = SKINS[n.style] || SKINS.classic, UI = k.ui || SANS;
  // Indeling per variant (met/zonder streefdatum onderin, met/zonder omklapkaartjes); getallen en eenheden staan dicht op elkaar
  const withDate = n.showDate !== false;
  const L = withDate
    ? (k.tiles ? { label: 34, nog: 56, tileY: 74, tileH: 56, num: 118, unit: 146, date: 178 } : { label: 34, nog: 58, num: 124, unit: 143, date: 176 })
    : (k.tiles ? { label: 46, nog: 76, tileY: 87, tileH: 64, num: 137, unit: 166 } : { label: 50, nog: 80, num: 142, unit: 161 });
  L.nog -= 3; // 'nog' iets dichter onder het label
  for (const key of ['tileY', 'num', 'unit']) if (L[key] !== undefined) L[key] -= 4;
  // 'Voorbij': duimpje en tekst, ruim boven de streefdatum
  const D = withDate ? { thumb: 108, size: 46, text: 146, tsize: 22 } : { thumb: 118, size: 58, text: 160, tsize: 24 };
  if (!n.label) { // zonder label schuift de middenpartij omhoog, zodat het geheel in het midden blijft
    const up = withDate ? 8 : 18;
    for (const key of ['nog', 'tileY', 'num', 'unit']) if (L[key] !== undefined) L[key] -= up;
    D.thumb -= up; D.text -= up;
  }
  const size = k.tiles && withDate ? 0.9 : 1;
  const label = n.label ? (() => {
    const long = [...n.label].length * 10 > 168;
    return `<text x="100" y="${L.label}" text-anchor="middle" font-family="${UI}" font-size="18" font-weight="700" fill="${k.label}"${long ? ' textLength="168" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(n.label)}</text>`;
  })() : '';
  const tiles = k.tiles ? [24, 112].map((x) => `<rect x="${x}" y="${L.tileY}" width="64" height="${L.tileH}" rx="9" fill="#2f3036" stroke="#0d0d0f" stroke-width="1.5"/><rect x="${x}" y="${L.tileY + L.tileH / 2 - 0.8}" width="64" height="1.6" fill="#0d0d0f"/>`).join('') : '';
  const FS = r2((k.tiles ? 50 : 58) * size * (k.numScale || 1));
  const num = (cls, x) => `<text class="${cls}" x="${x}" y="${L.num}" text-anchor="middle" font-family="${k.font}" font-size="${FS}" data-fs="${FS}" font-weight="${k.weight}" fill="${k.num}"></text>`;
  const unit = (cls, x) => `<text class="${cls}" x="${x}" y="${L.unit}" text-anchor="middle" font-family="${UI}" font-size="16" font-weight="600" fill="${k.unit}"></text>`;
  const dt = n.showDate !== false ? dateText(n.target) : '';
  const date = dt ? `<text x="100" y="${L.date}" text-anchor="middle" font-family="${UI}" font-size="16" font-weight="600" fill="${k.nog}"${dt.length * 8.8 > 172 ? ' textLength="172" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(dt)}</text>` : '';
  return `<svg viewBox="0 0 200 200" aria-hidden="true">${background(n.style, id)}${label}
    <g class="cd-live">
      <text x="100" y="${L.nog}" text-anchor="middle" font-family="${UI}" font-size="14" font-weight="600" letter-spacing="1.5" fill="${k.nog}">nog</text>
      ${tiles}${num('cd-n1', 56)}${num('cd-n2', 144)}${unit('cd-u1', 56)}${unit('cd-u2', 144)}
    </g>
    ${date}
    <g class="cd-done" visibility="hidden">
      <text x="100" y="${D.thumb}" text-anchor="middle" font-size="${D.size}">👍</text>
      <text x="100" y="${D.text}" text-anchor="middle" font-family="${UI}" font-size="${D.tsize}" font-weight="800" fill="${k.num}">Voorbij</text>
    </g>
  </svg>`;
}

// Zet de getallen op `s` resterende seconden. `box` bevat de tekening; alleen bij een verandering wordt de DOM aangeraakt.
export function updateCountdown(box, n, s) {
  const c = box._c || (box._c = {}), done = s <= 0, p = done ? null : countdownParts(s);
  const key = done ? 'done' : p.map((v) => v[0] + v[1]).join('|');
  if (c.key === key) return;
  c.key = key;
  box.querySelector('.cd-live').setAttribute('visibility', done ? 'hidden' : 'visible');
  box.querySelector('.cd-done').setAttribute('visibility', done ? 'visible' : 'hidden');
  if (!done) {
    const pad = (SKINS[n.style] || SKINS.classic).tiles;
    p.forEach(([count, one, many], i) => {
      const num = box.querySelector('.cd-n' + (i + 1)), txt = pad ? String(count).padStart(2, '0') : String(count);
      num.textContent = txt;
      num.setAttribute('font-size', r2(num.dataset.fs * (txt.length > 3 ? 0.58 : txt.length > 2 ? 0.76 : 1))); // drie of meer cijfers: kleiner in plaats van samengeperst
      box.querySelector('.cd-u' + (i + 1)).textContent = count === 1 ? one : many;
    });
  }
  const host = box.closest('.countdown');
  host?.classList.toggle('done', done);
  // schermlezers: alleen bijwerken als de minuten veranderen
  const stamp = done ? 'done' : Math.floor(s / 60);
  if (host && c.stamp !== stamp) {
    c.stamp = stamp;
    host.setAttribute('aria-label', `Afteller${n.label ? ' ' + n.label : ''}: ${done ? 'voorbij' : 'nog ' + p.map(([a, o, m]) => `${a} ${a === 1 ? o : m}`).join(' en ')}`);
  }
}
