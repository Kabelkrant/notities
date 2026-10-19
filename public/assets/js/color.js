// Tekstkleur op basis van de achtergrond: kies wit of de donkere tekstkleur, wat het meeste contrast geeft (WCAG)
const DARK_TEXT = '#1d1f27';
const luminance = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
};
const DARK_TEXT_L = luminance(DARK_TEXT);
// Voorkeur voor donkere tekst: 1 = puur het grootste contrast, lager = pas later wit (0.8 => omslag bij luminantie ~0,18; lager dan ~0,6 geeft slecht leesbare donkere tekst op middentonen)
const LIGHT_TEXT_BIAS = 0.8;
export function needsLightText(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const L = luminance(hex);
  return (1.05 / (L + 0.05)) * LIGHT_TEXT_BIAS > (L + 0.05) / (DARK_TEXT_L + 0.05); // contrast met wit (gewogen) > contrast met donker
}
