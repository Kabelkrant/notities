import { form } from './ui.js';

// Opmaak-toolbar (Markdown in de textarea)
const bodyField = form.body;

// Vervang een stuk tekst via insertText, zodat Ctrl+Z blijft werken
function replaceRange(start, end, text, selStart, selEnd) {
  bodyField.focus();
  bodyField.setSelectionRange(start, end);
  if (!document.execCommand('insertText', false, text)) bodyField.setRangeText(text, start, end, 'end');
  bodyField.setSelectionRange(selStart, selEnd);
}

function toggleInline(mark) {
  const v = bodyField.value, s = bodyField.selectionStart, e = bodyField.selectionEnd, m = mark.length;
  const sel = v.slice(s, e);
  const single = mark === '*'; // cursief niet verwarren met de ** van dik
  const wrappedOutside = v.slice(s - m, s) === mark && v.slice(e, e + m) === mark
    && !(single && (v[s - 2] === '*' || v[e + 1] === '*'));
  if (wrappedOutside) return replaceRange(s - m, e + m, sel, s - m, e - m);
  const wrappedInside = sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark)
    && !(single && (sel.startsWith('**') && sel.endsWith('**')));
  if (wrappedInside) return replaceRange(s, e, sel.slice(m, -m), s, e - 2 * m);
  replaceRange(s, e, mark + sel + mark, s + m, e + m);
}

function toggleList(kind) {
  const v = bodyField.value;
  let s = bodyField.selectionStart, e = bodyField.selectionEnd;
  if (e > s && v[e - 1] === '\n') e--;
  const start = v.lastIndexOf('\n', s - 1) + 1;
  const nl = v.indexOf('\n', e);
  const end = nl === -1 ? v.length : nl;
  const lines = v.slice(start, end).split('\n');
  const re = kind === 'bullets' ? /^\s*[-*+] / : /^\s*\d+\. /;
  const anyList = /^\s*([-*+]|\d+\.) /;
  const filled = lines.filter((l) => l.trim());
  const remove = filled.length > 0 && filled.every((l) => re.test(l));
  let n = 0;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    if (remove) return l.replace(re, '');
    const plain = l.replace(anyList, '');
    return kind === 'bullets' ? '- ' + plain : `${++n}. ${plain}`;
  }).join('\n');
  replaceRange(start, end, out, start, start + out.length);
}

const FORMATS = {
  bold: () => toggleInline('**'),
  italic: () => toggleInline('*'),
  underline: () => toggleInline('++'),
  bullets: () => toggleList('bullets'),
  numbers: () => toggleList('numbers'),
};
document.querySelector('.fmt-bar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // focus in de textarea houden
document.querySelector('.fmt-bar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fmt]');
  if (b) FORMATS[b.dataset.fmt]();
});
bodyField.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
  const fmt = { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
  if (fmt) { e.preventDefault(); FORMATS[fmt](); }
});
