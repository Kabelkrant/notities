import { $ } from './ui.js';
import { openDialog } from './dialog.js';

const newBtn = $('newBtn'), newMenu = $('newMenu');
function toggleMenu(open = newMenu.hidden) {
  newMenu.hidden = !open;
  newBtn.setAttribute('aria-expanded', String(open));
  if (open) newMenu.querySelector('button').focus();
}
newBtn.addEventListener('click', () => toggleMenu());
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.split')) toggleMenu(false); });
newMenu.addEventListener('keydown', (e) => {
  const btns = [...newMenu.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
  if (e.key === 'Escape') { toggleMenu(false); newBtn.focus(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
});
$('newNote').addEventListener('click', () => { toggleMenu(false); openDialog(null); });
$('newImage').addEventListener('click', () => { toggleMenu(false); $('imageInput').click(); });
