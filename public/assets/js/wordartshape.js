// Tekent WordArt als SVG: een tekst in een stijl (kleurverloop, rand, schaduw, 3D) op een rechte lijn, boog of golf.
// Alle stijlen zijn statisch (geen filters): één keer tekenen, daarna alleen schalen en roteren via CSS.
export const WORDART_STYLES = [
  ['rainbow', 'Regenboog'], ['chrome', 'Chroom'], ['gold', 'Goud 3D'], ['neon', 'Neon'], ['fire', 'Vuur'], ['retro', 'Retro'], ['comic', 'Strip'],
];
export const WORDART_SHAPES = [['straight', 'Recht'], ['arch_up', 'Boog omhoog'], ['arch_down', 'Boog omlaag'], ['wave', 'Golf']];
export const WORDART_MIN_W = 60, WORDART_MAX_W = 3000, WORDART_MAX_TEXT = 60, WORDART_DEFAULT_W = 260;

const F = 48; // lettergrootte in viewBox-eenheden; alles schaalt mee met de breedte van het item
const IMPACT = "Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const COMIC = "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', Impact, sans-serif";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = (v) => Math.round(v * 100) / 100;

function sampledLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}
function quad(p0, c, p1, n = 48) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}

// Afmetingen van het tekenvlak (viewBox) en eventueel het pad waarlangs de tekst loopt
export function wordartGeometry(text, shape) {
  const len = Math.max(1, [...text].length);
  const tw = Math.max(2.4 * F, len * 0.6 * F); // geschatte tekstbreedte; textLength rekt/knijpt de letters tot precies deze breedte
  const pad = F * 0.6, W = tw + 2 * pad, top = F * 1.05;
  if (shape === 'arch_up') {
    const sag = W * 0.2, yb = top + sag, yc = top - sag;
    const pts = quad([pad, yb], [W / 2, yc], [W - pad, yb]);
    return { W, H: yb + F * 0.45, path: `M${r2(pad)},${r2(yb)} Q${r2(W / 2)},${r2(yc)} ${r2(W - pad)},${r2(yb)}`, textLen: sampledLength(pts) * 0.94 };
  }
  if (shape === 'arch_down') {
    const sag = W * 0.2, yc = top + 2 * sag;
    const pts = quad([pad, top], [W / 2, yc], [W - pad, top]);
    return { W, H: top + sag + F * 0.45, path: `M${r2(pad)},${r2(top)} Q${r2(W / 2)},${r2(yc)} ${r2(W - pad)},${r2(top)}`, textLen: sampledLength(pts) * 0.94 };
  }
  if (shape === 'wave') {
    const A = F * 0.55, mid = top + A;
    const pts = [...quad([pad, mid], [W * 0.25, mid - 2 * A], [W / 2, mid]), ...quad([W / 2, mid], [W * 0.75, mid + 2 * A], [W - pad, mid])];
    return { W, H: mid + A + F * 0.45, path: `M${r2(pad)},${r2(mid)} Q${r2(W * 0.25)},${r2(mid - 2 * A)} ${r2(W / 2)},${r2(mid)} T${r2(W - pad)},${r2(mid)}`, textLen: sampledLength(pts) * 0.94 };
  }
  return { W, H: F * 1.7, path: null, textLen: tw, x: W / 2, y: F * 1.2 };
}

// Hoogte/breedte-verhouding van een item (de hoogte volgt uit de breedte)
export function wordartRatio(text, shape) {
  const g = wordartGeometry(text, shape);
  return g.H / g.W;
}

/* ---------- Stijlen: gradiënten en lagen (onderste laag eerst) ---------- */
function styleDef(style, id) {
  const lin = (name, stops, vertical) => `<linearGradient id="${id(name)}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const sw = F * 0.045, off = F * 0.07;
  const shadow = { fill: 'rgba(0,0,0,.35)', transform: `translate(${r2(off)} ${r2(off * 1.2)})` };
  const edge = (stroke, w = sw) => ({ stroke, 'stroke-width': r2(w), 'stroke-linejoin': 'round', 'paint-order': 'stroke' });
  switch (style) {
    case 'chrome':
      return { font: IMPACT, defs: lin('g', [[0, '#ffffff'], [0.45, '#8fa8cf'], [0.5, '#2c3d63'], [1, '#c9d6ea']], true), layers: [shadow, { fill: `url(#${id('g')})`, ...edge('#1d2740') }] };
    case 'gold': {
      const ext = [];
      for (let i = 5; i >= 1; i--) ext.push({ fill: i > 3 ? '#5a3900' : '#6b4300', transform: `translate(${r2(off * i * 0.8)} ${r2(off * i * 0.8)})` });
      return { font: IMPACT, defs: lin('g', [[0, '#fff3b0'], [0.5, '#f2b300'], [1, '#a86a00']], true), layers: [...ext, { fill: `url(#${id('g')})`, ...edge('#7a4d00', sw * 0.8) }] };
    }
    case 'neon':
      return { font: IMPACT, defs: '', layers: [
        { fill: 'none', stroke: '#ff2bd6', 'stroke-opacity': 0.2, 'stroke-width': r2(F * 0.22), 'stroke-linejoin': 'round' },
        { fill: 'none', stroke: '#ff2bd6', 'stroke-opacity': 0.4, 'stroke-width': r2(F * 0.13), 'stroke-linejoin': 'round' },
        { fill: '#ffe6fb', stroke: '#ff2bd6', 'stroke-width': r2(F * 0.06), 'stroke-linejoin': 'round' },
      ] };
    case 'fire':
      return { font: IMPACT, defs: lin('g', [[0, '#fff176'], [0.5, '#ff9800'], [1, '#d50000']], true), layers: [shadow, { fill: `url(#${id('g')})`, ...edge('#7a1100') }] };
    case 'retro':
      return { font: IMPACT, defs: lin('g', [[0, '#ff7ad9'], [1, '#7a3cff']], true), layers: [
        { fill: '#00c2c7', transform: `translate(${r2(off * 1.9)} ${r2(off * 1.9)})` }, { fill: '#00c2c7', transform: `translate(${r2(off)} ${r2(off)})` },
        { fill: `url(#${id('g')})`, ...edge('#ffffff', sw * 1.4) },
      ] };
    case 'comic':
      return { font: COMIC, weight: 900, defs: '', layers: [
        { fill: '#111', ...edge('#111', F * 0.1), transform: `translate(${r2(off * 1.3)} ${r2(off * 1.3)})` },
        { fill: '#ffe34d', ...edge('#111', F * 0.1) },
      ] };
    default: // rainbow
      return { font: IMPACT, defs: lin('g', [[0, '#e53935'], [0.2, '#fb8c00'], [0.4, '#fdd835'], [0.6, '#43a047'], [0.8, '#1e88e5'], [1, '#8e24aa']], false), layers: [shadow, { fill: `url(#${id('g')})`, ...edge('#222', sw * 0.9) }] };
  }
}

let uidCounter = 0;

export function wordartMarkup(n) {
  const uid = `w${++uidCounter}_`, id = (k) => uid + k;
  const text = n.text || 'WordArt', g = wordartGeometry(text, n.shape), s = styleDef(n.style, id);
  const attrsTxt = g.path
    ? ''
    : ` x="${r2(g.x)}" y="${r2(g.y)}" textLength="${r2(g.textLen)}" lengthAdjust="spacingAndGlyphs"`;
  const body = g.path
    ? `<textPath href="#${id('p')}" startOffset="50%" textLength="${r2(g.textLen)}" lengthAdjust="spacingAndGlyphs">${esc(text)}</textPath>`
    : esc(text);
  const uses = s.layers.map((l) => `<use href="#${id('t')}" ${Object.entries(l).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(g.W)} ${r2(g.H)}" aria-hidden="true"><defs>${s.defs}${g.path ? `<path id="${id('p')}" d="${g.path}"/>` : ''}`
    + `<text id="${id('t')}" font-family="${s.font}" font-weight="${s.weight || 400}" font-size="${F}" text-anchor="middle"${attrsTxt}>${body}</text></defs>${uses}</svg>`;
}
