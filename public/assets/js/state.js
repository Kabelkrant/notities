export const boot = JSON.parse(document.getElementById('boot').textContent);
export const csrf = boot.csrf;
export const POLL_MS = 4000;
export const UNDO_MS = 6000;
export const MIN_SIZE = 40, MAX_SIZE = 5000;
export const ZOOM_MIN = 0.05, ZOOM_MAX = 4;
export const ZOOM_STEPS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]; // knoppen; het wiel zoomt traploos
export const GRID = 20; // rasterstap in bordcoördinaten (snap to grid)
// Drempels voor 'afbeelding te groot' (uit .env via de server)
export const IMAGE_MAX_DIM = boot.imageMaxDim || 2000;
export const IMAGE_MAX_BYTES = boot.imageMaxBytes || 2048 * 1024;
// Welke soorten items er nog toegevoegd mogen worden (server: ALLOW_* in .env); bestaande items blijven werken
export const ALLOW = boot.allow || {};
export const COLORS = ['#FFF59D', '#FFCC80', '#F48FB1', '#CE93D8', '#90CAF9', '#80DEEA', '#A5D6A7', '#E0E0E0'];

export const items = new Map();   // id -> data (notitie of afbeelding)
export const els = new Map();     // id -> element
export const selected = new Set();      // ids van geselecteerde items
export const pendingDelete = new Map(); // id -> {timer, commit}
export const hiddenIds = new Set();     // ids die (tijdelijk) niet meer getoond worden, in afwachting van definitief verwijderen
export const TRASH = -1;                // map-id van de systeemmap Prullenbak; notities daarin staan niet op het canvas

export const state = {
  version: boot.version,
  zoom: boot.zoom || 1,   // huidig (getekend) zoomniveau; kan tijdens een animatie tussen twee stappen liggen
  tx: boot.panX || 0,     // verschuiving van de wereld op het scherm (px)
  ty: boot.panY || 0,
  snap: !!boot.snap,
  folders: boot.folders || [{ id: 0, name: '(niet ingedeeld)' }], // mappen van de notitie-app, in volgorde; map 0 is (niet ingedeeld)
  mode: boot.mode || 'canvas', // weergavemodus: 'canvas' of 'notes' (notitie-app)
  busy: false,            // slepen of schalen bezig
  missedWhileBusy: false,
  statusHoldUntil: 0,
};
