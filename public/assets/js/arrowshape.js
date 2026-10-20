// Tekent een pijl als SVG-tekst. Het bounding box is w x h (lengte x dikte); de pijl wijst naar rechts en wordt via CSS geroteerd.
export const ARROW_STYLES = [
  ['solid', 'Blokpijl'], ['outline', 'Omlijnd'], ['line', 'Lijn'], ['dashed', 'Gestreept'], ['double', 'Dubbel'],
];
export const ARROW_COLORS = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA', '#1D1F27', '#9E9E9E'];
export const ARROW_DEFAULT_W = 180, ARROW_DEFAULT_H = 48;
export const ARROW_MIN_W = 40, ARROW_MIN_H = 16, ARROW_MAX_H = 400;

const r1 = (v) => Math.round(v * 10) / 10;

export function arrowSvg(style, w, h, color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#E53935';
  const mid = h / 2;
  let body;
  if (style === 'solid' || style === 'outline') {
    const hl = Math.max(8, Math.min(h * 0.9, w * 0.5)); // lengte van de kop
    const a = h * 0.28, b = h * 0.72;                    // bovenkant en onderkant van de schacht
    const pts = [[0, a], [w - hl, a], [w - hl, 0], [w, mid], [w - hl, h], [w - hl, b], [0, b]].map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');
    body = style === 'solid'
      ? `<polygon points="${pts}" fill="${color}"/>`
      : `<polygon points="${pts}" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-width="${r1(Math.max(2, h * 0.06))}" stroke-linejoin="round"/>`;
  } else {
    const sw = Math.min(14, Math.max(3, h * 0.14));       // lijndikte
    const hh = Math.max(1, h / 2 - sw / 2);               // halve hoogte van de kop
    const hlen = Math.min(hh, w / 2 - sw);                // lengte van de kop
    const x0 = sw / 2, x1 = w - sw / 2;
    const head = (tip, dir) => `<polyline points="${r1(tip + dir * hlen)},${r1(mid - hh)} ${r1(tip)},${r1(mid)} ${r1(tip + dir * hlen)},${r1(mid + hh)}"/>`;
    const dash = style === 'dashed' ? ` stroke-dasharray="${r1(sw * 2)} ${r1(sw * 1.8)}"` : '';
    body = `<g fill="none" stroke="${color}" stroke-width="${r1(sw)}" stroke-linecap="round" stroke-linejoin="round">`
      + `<line x1="${r1(x0)}" y1="${r1(mid)}" x2="${r1(x1)}" y2="${r1(mid)}"${dash}/>`
      + head(x1, -1) + (style === 'double' ? head(x0, 1) : '') + '</g>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(w)} ${r1(h)}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
}
