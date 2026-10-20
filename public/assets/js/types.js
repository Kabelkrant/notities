import { MIN_SIZE, MAX_SIZE } from './state.js';

// Register van itemtypes: elk type meldt zich aan (defineType) met wat het kan, zodat de rest van de app niet per type hoeft te weten wat er moet gebeuren.
//   label:   naam in meldingen (tekst of functie van het item)
//   edit:    opent de bewerkdialoog voor dit item
//   dbl:     true = dubbelklikken op het item bewerkt; een selector = alleen dubbelklikken op dat onderdeel
//   rotatable: item kan roteren (greepje en toets R)
//   create:  () => {w, h, top} voor create_item: formaat voor de vrije plek en ruimte erboven; ontbreekt = niet via het menu aan te maken
//   resize:  {mode: 'free'|'square'|'box', min, max, minH, maxH, keepRatio, fields}; 'box' schaalt in de eigen (geroteerde) assen,
//            keepRatio = met Shift de verhouding vasthouden, fields = wat er naar de server gaat
export const TYPES = {};
export function defineType(name, def) { TYPES[name] = def; }
export function typeLabel(n) {
  const l = TYPES[n.type]?.label;
  return typeof l === 'function' ? l(n) : l || 'Item';
}

defineType('image', { label: 'Afbeelding', resize: { mode: 'free', min: MIN_SIZE, max: MAX_SIZE, fields: ['w', 'h'] } });
