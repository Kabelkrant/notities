import { boot } from './js/state.js';

if (boot.auth) {
  const { applyServerItems } = await import('./js/render.js');
  await Promise.all(['sync', 'menu', 'zoom', 'dialog', 'upload', 'actions', 'drag'].map((m) => import(`./js/${m}.js`)));
  applyServerItems(boot.notes);
} else {
  await import('./js/login.js');
}
