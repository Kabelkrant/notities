export const boot = JSON.parse(document.getElementById('boot').textContent);
export const csrf = boot.csrf;
export const POLL_MS = 4000;
export const UNDO_MS = 6000;
export const MIN_SIZE = 40, MAX_SIZE = 5000;
export const COLORS = ['#FFF59D', '#FFCC80', '#F48FB1', '#CE93D8', '#90CAF9', '#80DEEA', '#A5D6A7', '#E0E0E0'];

export const items = new Map();   // id -> data (notitie of afbeelding)
export const els = new Map();     // id -> element
export const pendingDelete = new Map(); // id -> {timer, commit}

export const state = {
  version: boot.version,
  busy: false,            // slepen of schalen bezig
  missedWhileBusy: false,
  statusHoldUntil: 0,
};
