import { $ } from './ui.js';
import { openDialog } from './dialog.js';
import { api } from './api.js';
import { setZoom } from './zoom.js';
import { toggleSnap } from './snap.js';
import { openAbout } from './about.js';
import { createItem } from './create.js';

// Twee uitklapmenu's (hoofdmenu en Nieuw); openen van de ene sluit de andere
const menus = [];
const EDGE = 8; // minimale afstand tot de rand van het scherm
function keepInView(menu) {
  if (menu.dataset.align !== 'center') return;
  menu.style.setProperty('--shift', '0px');
  const r = menu.getBoundingClientRect(), w = document.documentElement.clientWidth;
  const shift = r.left < EDGE ? EDGE - r.left : r.right > w - EDGE ? w - EDGE - r.right : 0;
  menu.style.setProperty('--shift', Math.round(shift) + 'px');
}

function setupMenu(btn, menu) {
  const toggle = (open = menu.hidden) => {
    if (open) for (const m of menus) if (m.menu !== menu) m.toggle(false);
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) { keepInView(menu); menu.querySelector('button:not([hidden])')?.focus(); }
  };
  btn.addEventListener('click', () => toggle());
  menu.addEventListener('keydown', (e) => {
    const btns = [...menu.querySelectorAll('button:not([hidden])')], i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') { toggle(false); btn.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  });
  addEventListener('resize', () => { if (!menu.hidden) keepInView(menu); });
  menus.push({ menu, toggle });
  return toggle;
}
const toggleMain = setupMenu($('mainBtn'), $('mainMenu'));
const toggleMenu = setupMenu($('newBtn'), $('newMenu'));
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.split')) for (const m of menus) m.toggle(false); });
$('newNote').addEventListener('click', () => { toggleMenu(false); openDialog(null); });
$('newImage').addEventListener('click', () => { toggleMenu(false); $('imageInput').click(); });
// overige items: data-create bevat het itemtype
for (const b of document.querySelectorAll('#newMenu [data-create]')) b.addEventListener('click', () => { toggleMenu(false); createItem(b.dataset.create); });
$('resetZoom').addEventListener('click', () => { toggleMain(false); setZoom(1); });
$('snapToggle').addEventListener('click', () => { toggleMain(false); toggleSnap(); });
$('logoutBtn').addEventListener('click', async () => { toggleMain(false); try { await api({ action: 'logout' }); } finally { location.reload(); } });
$('aboutBtn').addEventListener('click', () => { toggleMain(false); openAbout(); });
