export const boot = JSON.parse(document.getElementById('boot').textContent);
export const csrf = boot.csrf;
export const POLL_MS = 4000;
export const UNDO_MS = 6000;
export const MIN_SIZE = 40, MAX_SIZE = 5000;
export const ZOOM_STEPS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const GRID = 20; // rasterstap in bordcoördinaten (snap to grid)
// Drempels voor 'afbeelding te groot' (uit .env via de server)
export const IMAGE_MAX_DIM = boot.imageMaxDim || 2000;
export const IMAGE_MAX_BYTES = boot.imageMaxBytes || 2048 * 1024;
export const COLORS = ['#FFF59D', '#FFCC80', '#F48FB1', '#CE93D8', '#90CAF9', '#80DEEA', '#A5D6A7', '#E0E0E0'];

export const items = new Map();   // id -> data (notitie of afbeelding)
export const els = new Map();     // id -> element
export const pendingDelete = new Map(); // id -> {timer, commit}

export const state = {
  version: boot.version,
  zoom: boot.zoom || 1,
  snap: !!boot.snap,
  busy: false,            // slepen of schalen bezig
  missedWhileBusy: false,
  statusHoldUntil: 0,
};
