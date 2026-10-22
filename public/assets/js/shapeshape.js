// Tekent een vorm als SVG-tekst. Het bounding box is w x h; de rand ligt volledig binnen dat vak.
export const SHAPE_KINDS = [['rect', 'Rechthoek'], ['circle', 'Cirkel'], ['arrow', 'Pijl'], ['heart', 'Hartje']];
export const SHAPE_DEFAULT_W = 200, SHAPE_DEFAULT_H = 120;
export const SHAPE_MIN = 30, SHAPE_MAX_TEXT = 300;

// Kleurstellingen: vulling, rand en tekstkleur in één keuze
// Zes kleurstellingen met witte tekst (de eerste is ook de standaard voor een nieuwe vorm), 'Alleen omtrek' met donkere tekst
export const SHAPE_PRESETS = [
  { name: 'Petrol', fillOn: true, fillColor: '#166786', strokeOn: true, strokeColor: '#0E4A62', textColor: '#FFFFFF' },
  { name: 'Bos', fillOn: true, fillColor: '#1F7A34', strokeOn: true, strokeColor: '#14572A', textColor: '#FFFFFF' },
  { name: 'Orchidee', fillOn: true, fillColor: '#9E3396', strokeOn: true, strokeColor: '#6F2468', textColor: '#FFFFFF' },
  { name: 'Hemel', fillOn: true, fillColor: '#0C8CC2', strokeOn: true, strokeColor: '#075C80', textColor: '#FFFFFF' },
  { name: 'Mandarijn', fillOn: true, fillColor: '#DB6122', strokeOn: true, strokeColor: '#9C4210', textColor: '#FFFFFF' },
  { name: 'Roze', fillOn: true, fillColor: '#D13A72', strokeOn: true, strokeColor: '#AD285A', textColor: '#FFFFFF' },
  { name: 'Alleen omtrek', fillOn: false, fillColor: '#FFFFFF', strokeOn: true, strokeColor: '#444954', textColor: '#2A3040' },
].map((p) => ({ strokeW: 3, fillTransp: 0, ...p })); // op positie 8 staat 'Aangepast' (geen kleurstelling maar het openen van de ontwerpopties)

const r1 = (v) => Math.round(v * 10) / 10;
const HEX = /^#[0-9a-f]{6}$/i;
const col = (c, fallback) => HEX.test(c) ? c : fallback;

export function shapeSvg(n, w, h) {
  w = Math.max(1, w); h = Math.max(1, h);
  const sw = n.strokeOn ? Math.max(0, n.strokeW) : 0, i = sw / 2;
  const x0 = i, y0 = i, iw = Math.max(1, w - sw), ih = Math.max(1, h - sw); // vak binnen de rand
  const fill = n.fillOn ? col(n.fillColor, '#1E88E5') : 'none';
  const op = n.fillOn ? Math.max(0, Math.min(1, 1 - n.fillTransp / 100)) : 1;
  const attrs = `fill="${fill}" fill-opacity="${r1(op * 100) / 100}"` + (sw ? ` stroke="${col(n.strokeColor, '#0D47A1')}" stroke-width="${r1(sw)}" stroke-linejoin="round"` : '');
  let body;
  if (n.kind === 'circle') {
    body = `<ellipse cx="${r1(w / 2)}" cy="${r1(h / 2)}" rx="${r1(iw / 2)}" ry="${r1(ih / 2)}" ${attrs}/>`;
  } else if (n.kind === 'arrow') {
    const hl = Math.max(8, Math.min(ih * 0.9, iw * 0.5)); // lengte van de kop
    const a = y0 + ih * 0.28, b = y0 + ih * 0.72, mid = y0 + ih / 2, x1 = x0 + iw;
    const pts = [[x0, a], [x1 - hl, a], [x1 - hl, y0], [x1, mid], [x1 - hl, y0 + ih], [x1 - hl, b], [x0, b]].map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');
    body = `<polygon points="${pts}" ${attrs}/>`;
  } else if (n.kind === 'heart') {
    const P = (u, v) => `${r1(x0 + u * iw)} ${r1(y0 + v * ih)}`;
    body = `<path d="M${P(.5, 1)} C${P(.12, .72)} ${P(0, .5)} ${P(0, .3)} C${P(0, .12)} ${P(.13, 0)} ${P(.28, 0)} C${P(.38, 0)} ${P(.46, .05)} ${P(.5, .16)} C${P(.54, .05)} ${P(.62, 0)} ${P(.72, 0)} C${P(.87, 0)} ${P(1, .12)} ${P(1, .3)} C${P(1, .5)} ${P(.88, .72)} ${P(.5, 1)}Z" ${attrs}/>`;
  } else {
    const rx = Math.min(iw, ih) * 0.18;
    body = `<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(iw)}" height="${r1(ih)}" rx="${r1(rx)}" ${attrs}/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(w)} ${r1(h)}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
}

// Past de tekst in zijn vak: begint op de gekozen grootte en krimpt zo nodig, maar nooit onder de helft (minimaal 10 px; een kleinere
// gekozen grootte blijft staan). Past het dan nog niet, dan blijft de tekst op die ondergrens en wordt hij afgekapt.
// `box` is het tekstvak (.shape-text), het eerste kind de tekst zelf; gemeten in lay-outpixels, dus onafhankelijk van zoom en rotatie.
export function fitText(box, size) {
  const inner = box.firstElementChild, min = Math.min(size, Math.max(10, Math.round(size * 0.5)));
  const fits = (px) => { box.style.fontSize = px + 'px'; return inner.offsetHeight <= box.clientHeight && inner.offsetWidth <= box.clientWidth; };
  if (!inner.textContent || fits(size)) return size;
  if (!fits(min)) return min;
  let lo = min, hi = size;
  while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  box.style.fontSize = lo + 'px';
  return lo;
}
