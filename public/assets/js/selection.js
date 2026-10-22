import { els, selected } from './state.js';
import { board } from './ui.js';

// Meervoudige selectie: Ctrl+klik zet een item aan of uit de selectie

function mark() {
  for (const [id, el] of els) el.classList.toggle('selected', selected.has(id));
}

export function clearSelection() {
  if (!selected.size) return;
  selected.clear();
  mark();
}

export function toggleSelected(id) {
  if (!selected.delete(id)) selected.add(id);
  mark();
}

// Een klik op leeg bord (zonder te slepen) heft de selectie op; slepen daar pant het bord (zoom.js)
let down = null;
board.addEventListener('pointerdown', (e) => {
  down = e.target === board && e.button === 0 && !e.ctrlKey && !e.metaKey ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
});
board.addEventListener('pointerup', (e) => {
  if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) clearSelection();
  down = null;
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected.size && !document.querySelector('dialog[open]')) clearSelection(); });
