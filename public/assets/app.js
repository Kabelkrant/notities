import { boot } from './js/state.js';
import { applyServerItems } from './js/render.js';
import './js/sync.js';
import './js/menu.js';
import './js/dialog.js';
import './js/upload.js';
import './js/actions.js';
import './js/drag.js';

applyServerItems(boot.notes);
