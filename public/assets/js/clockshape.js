// Tekent analoge en digitale klokken als SVG en werkt de wijzers/cijfers bij.
// De wijzerplaat (statisch) en de wijzers (bewegend) zijn aparte SVG's boven elkaar: per seconde verandert er alleen een rotate().
export const CLOCK_STYLES = [
  ['classic', 'Klassiek'], ['red', 'Rood'], ['neon', 'Neon'], ['black', 'Zwarte rand'], ['digital', 'Digitaal'],
];
export const CLOCK_DEFAULT_SIZE = 160, CLOCK_MIN_SIZE = 80, CLOCK_MAX_SIZE = 600, CLOCK_MAX_LABEL = 40;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (v) => Math.round(v * 100) / 100;
let uidCounter = 0;

/* ---------- Tijd in een tijdzone ---------- */
const formatters = new Map();
function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    const opts = { hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' };
    try { f = new Intl.DateTimeFormat('en-GB', tz ? { ...opts, timeZone: tz } : opts); }
    catch { f = new Intl.DateTimeFormat('en-GB', opts); } // onbekende tijdzone: lokale tijd
    formatters.set(tz, f);
  }
  return f;
}
// {h, m, s}; `cache` (per tik) voorkomt dat dezelfde tijdzone meermaals wordt opgevraagd
export function timeIn(tz, date, cache) {
  const key = tz || '';
  let t = cache?.get(key);
  if (!t) {
    t = {};
    for (const p of formatter(key).formatToParts(date)) if (p.type === 'hour') t.h = +p.value; else if (p.type === 'minute') t.m = +p.value; else if (p.type === 'second') t.s = +p.value;
    cache?.set(key, t);
  }
  return t;
}

/* ---------- Analoge klokken ---------- */
const PALETTE = {
  classic: { rim: ['#fafafa', '#9a9ea4'], bevel: ['#8c9097', '#f4f4f4'], face: ['#ffffff', '#e1e4e8'], tick: '#34373c', minTick: '#80858c', num: null, hand: '#202327', sec: '#d32f2f', label: '#2b2f35', halo: '#ffffff', gloss: 0.55 },
  red: { rim: ['#ff7a70', '#8f0d0d'], bevel: ['#7c0b0b', '#ff9a90'], face: ['#f0453d', '#a81616'], tick: '#ffffff', minTick: '#ffd7d3', num: null, hand: '#ffffff', sec: '#ffe9a8', label: '#ffffff', halo: '#a81616', gloss: 0.5 },
  neon: { rim: ['#1a2a5c', '#050a1c'], bevel: ['#050a1c', '#1a2a5c'], face: ['#0c1740', '#02050f'], tick: '#bcd8ff', minTick: '#5a86d6', num: null, hand: '#eef4ff', sec: '#ff3b3b', label: '#b4d3ff', halo: '#02050f', gloss: 0.12, neon: true },
  black: { rim: ['#5a5a5a', '#050505'], bevel: ['#d6d6d6', '#6e6e6e'], face: ['#fbf6e8', '#e3dac3'], tick: '#2a2a2a', minTick: '#6b6659', num: '#2a2a2a', hand: '#1c1c1c', sec: '#d32f2f', label: '#25221a', halo: '#fbf6e8', gloss: 0.3 },
};

function analog(n, uid) {
  const p = PALETTE[n.style] || PALETTE.classic;
  const id = (k) => `${uid}${k}`;
  const defs = `<defs>
    <linearGradient id="${id('rim')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.rim[0]}"/><stop offset="1" stop-color="${p.rim[1]}"/></linearGradient>
    <linearGradient id="${id('bev')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bevel[0]}"/><stop offset="1" stop-color="${p.bevel[1]}"/></linearGradient>
    <radialGradient id="${id('face')}" cx=".42" cy=".36" r=".8"><stop offset="0" stop-color="${p.face[0]}"/><stop offset="1" stop-color="${p.face[1]}"/></radialGradient>
    <linearGradient id="${id('gl')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${p.gloss}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>`;
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0, a = i * 6 * Math.PI / 180, r2 = 86, r1v = r2 - (major ? 11 : 4.5);
    ticks += `<line x1="${r1(100 + Math.sin(a) * r1v)}" y1="${r1(100 - Math.cos(a) * r1v)}" x2="${r1(100 + Math.sin(a) * r2)}" y2="${r1(100 - Math.cos(a) * r2)}" stroke="${major ? p.tick : p.minTick}" stroke-width="${major ? 3.2 : 1}" stroke-linecap="round"/>`;
  }
  let nums = '';
  if (p.num) for (let i = 1; i <= 12; i++) {
    const a = i * 30 * Math.PI / 180;
    nums += `<text x="${r1(100 + Math.sin(a) * 66)}" y="${r1(100 - Math.cos(a) * 66 + 6)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="19" fill="${p.num}">${i}</text>`;
  }
  // label: groter en vetter, met een rand in de kleur van de wijzerplaat (halo) zodat het ook over ticks en gloed leesbaar blijft
  const lw = n.label ? n.label.length * 9 : 0;
  const label = n.label ? `<text x="100" y="${p.num ? 130 : 136}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="${p.label}" stroke="${p.halo}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"${lw > 112 ? ' textLength="112" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(n.label)}</text>` : '';
  const neon = p.neon
    ? `<circle cx="100" cy="100" r="86" fill="none" stroke="#2f7bff" stroke-opacity=".28" stroke-width="13"/><circle cx="100" cy="100" r="86" fill="none" stroke="#4a9bff" stroke-width="4"/><circle cx="100" cy="100" r="86" fill="none" stroke="#c4e2ff" stroke-width="1.3" stroke-opacity=".9"/>`
    : '';
  const face = `<svg class="clock-face" viewBox="0 0 200 200" aria-hidden="true">${defs}
    <circle cx="100" cy="100" r="99" fill="url(#${id('rim')})"/>
    <circle cx="100" cy="100" r="93.5" fill="url(#${id('bev')})"/>
    <circle cx="100" cy="100" r="90" fill="url(#${id('face')})"/>
    ${neon}${ticks}${nums}${label}
    <ellipse cx="100" cy="56" rx="66" ry="38" fill="url(#${id('gl')})"/>
  </svg>`;
  const hand = (pts, fill) => `<polygon points="${pts}" fill="rgba(0,0,0,.26)" transform="translate(2.2 3)"/><polygon points="${pts}" fill="${fill}"/>`;
  const hands = `<svg class="clock-hands" viewBox="0 0 200 200" aria-hidden="true">
    <g class="hand h">${hand('95.5,110 97,52 100,44 103,52 104.5,110', p.hand)}</g>
    <g class="hand m">${hand('96.5,112 97.8,28 100,19 102.2,28 103.5,112', p.hand)}</g>
    ${n.seconds ? `<g class="hand s"><line x1="102" y1="125" x2="102" y2="26" stroke="rgba(0,0,0,.22)" stroke-width="1.6"/><line x1="100" y1="122" x2="100" y2="22" stroke="${p.sec}" stroke-width="1.7" stroke-linecap="round"/><circle cx="100" cy="100" r="5" fill="${p.sec}"/></g>` : ''}
    <circle cx="100" cy="100" r="3" fill="${n.seconds ? '#e9e9e9' : p.hand}" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>
  </svg>`;
  return face + hands;
}

/* ---------- Digitale klok (7 segmenten, rood op zwart) ---------- */
const SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const LIT = '#ff3a2c', UNLIT = '#3b0d0a';

function digitPolys(x, y, w, h, t) {
  const g = Math.max(0.6, t * 0.16), hc = (cy) => [[t / 2 + g, cy], [t + g, cy - t / 2], [w - t - g, cy - t / 2], [w - t / 2 - g, cy], [w - t - g, cy + t / 2], [t + g, cy + t / 2]];
  const vc = (cx, y1, y2) => [[cx, y1], [cx + t / 2, y1 + t / 2], [cx + t / 2, y2 - t / 2], [cx, y2], [cx - t / 2, y2 - t / 2], [cx - t / 2, y1 + t / 2]];
  const sh = (pts) => pts.map(([px, py]) => `${r1(x + px)},${r1(y + py)}`).join(' ');
  const segs = {
    a: hc(t / 2), g: hc(h / 2), d: hc(h - t / 2),
    f: vc(t / 2, t / 2 + g, h / 2 - g), b: vc(w - t / 2, t / 2 + g, h / 2 - g),
    e: vc(t / 2, h / 2 + g, h - t / 2 - g), c: vc(w - t / 2, h / 2 + g, h - t / 2 - g),
  };
  return 'abcdefg'.split('').map((k) => `<polygon data-s="${k}" points="${sh(segs[k])}" fill="${UNLIT}"/>`).join('');
}

function digital(n) {
  const big = [[22, 46], [60, 46], [104, 46], [142, 46]]; // HH:MM
  const small = [[148, 118], [166, 118]];                 // SS
  let digits = '';
  big.forEach(([x, y], i) => { digits += `<g class="dg" data-i="${i}">${digitPolys(x, y, 32, 62, 7)}</g>`; });
  if (n.seconds) small.forEach(([x, y], i) => { digits += `<g class="dg" data-i="${4 + i}">${digitPolys(x, y, 15, 28, 3.6)}</g>`; });
  const colon = `<g class="colon" fill="${LIT}"><rect x="95" y="66" width="6" height="6" rx="1"/><rect x="95" y="90" width="6" height="6" rx="1"/></g>`;
  const label = n.label ? `<text x="100" y="178" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="17" font-weight="600" fill="#ff6a5e"${n.label.length * 9.5 > 150 ? ' textLength="150" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(n.label)}</text>` : '';
  return `<svg class="clock-digits" viewBox="0 0 200 200" aria-hidden="true">
    <defs><linearGradient id="g${uidCounter}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262626"/><stop offset="1" stop-color="#050505"/></linearGradient></defs>
    <rect x="3" y="3" width="194" height="194" rx="30" fill="url(#g${uidCounter})" stroke="#4a4a4a" stroke-width="1.5"/>
    <rect x="9" y="9" width="182" height="182" rx="25" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="2"/>
    ${digits}${colon}${label}
  </svg>`;
}

/* ---------- Publieke API ---------- */
// Markup voor de klok (zonder de wrapper)
export function clockMarkup(n) {
  uidCounter++;
  return n.style === 'digital' ? digital(n) : analog(n, `c${uidCounter}_`);
}

// Zet wijzers/cijfers op tijd t. `box` is het element dat de klok bevat. Alleen veranderde delen worden aangeraakt.
export function updateClock(box, n, t) {
  const c = box._c || (box._c = {});
  if (n.style === 'digital') {
    const str = String(t.h).padStart(2, '0') + String(t.m).padStart(2, '0') + String(t.s).padStart(2, '0');
    const groups = box.querySelectorAll('.dg');
    groups.forEach((g, i) => {
      const d = str[i];
      if (c['d' + i] === d) return;
      c['d' + i] = d;
      const lit = SEGMENTS[+d];
      for (const poly of g.children) poly.setAttribute('fill', lit.includes(poly.dataset.s) ? LIT : UNLIT);
    });
    const colon = box.querySelector('.colon');
    if (colon) colon.setAttribute('opacity', t.s % 2 === 0 ? '1' : '0.25'); // dubbele punt knippert per seconde
  } else {
    const set = (cls, deg) => {
      if (c[cls] === deg) return;
      c[cls] = deg;
      const el = box.querySelector('.hand.' + cls);
      if (el) el.style.transform = `rotate(${deg}deg)`;
    };
    set('h', r1(((t.h % 12) + t.m / 60 + t.s / 3600) * 30));
    set('m', r1((t.m + t.s / 60) * 6));
    set('s', t.s * 6);
  }
  // schermlezers: tekst elke minuut bijwerken, niet elke seconde
  const stamp = `${t.h}:${String(t.m).padStart(2, '0')}`;
  if (c.stamp !== stamp) {
    c.stamp = stamp;
    const host = box.closest('.clock');
    if (host) host.setAttribute('aria-label', `Klok${n.label ? ' ' + n.label : n.tz ? ' ' + n.tz.split('/').pop().replace(/_/g, ' ') : ''}, ${stamp}`);
  }
}
