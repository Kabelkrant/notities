import { form, dialog } from './ui.js';

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

/* ---------- Links: [tekst](adres) ---------- */
const linkBox = document.getElementById('linkBox'), linkText = document.getElementById('linkText');
const linkUrl = document.getElementById('linkUrl'), linkError = document.getElementById('linkError');
const linkRemove = document.getElementById('linkRemove');
let linkTarget = null; // {start, end, existing} van de tekst die vervangen wordt
const MD_LINK = /\[((?:\\.|[^\]\\])*)\]\(([^)\s]*)\)/g;
const escLabel = (t) => t.replace(/[\[\]]/g, '\\$&');

// Staat de cursor (of selectie) binnen een bestaande Markdown-link?
function linkAt(v, s, e) {
  for (const m of v.matchAll(MD_LINK)) {
    const a = m.index, b = a + m[0].length;
    if (s >= a && e <= b && !(s === e && (s === a || s === b))) {
      return { start: a, end: b, text: m[1].replace(/\\([\[\]])/g, '$1'), url: m[2] };
    }
  }
  return null;
}

// Alleen http(s) en mailto; ontbrekend https:// wordt aangevuld, haakjes en spaties worden veilig gemaakt
function normalizeUrl(u) {
  u = u.replace(/\s+/g, '%20');
  if (!/^(https?:\/\/|mailto:)/i.test(u)) {
    if (u.includes('://')) return null;
    u = /^[^\s@\/%]+@[^\s@\/%]+\.[^\s@\/%]+$/.test(u) ? 'mailto:' + u : 'https://' + u;
  }
  return u.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

const looksLikeUrl = (t) => /^(https?:\/\/|www\.)\S+$/i.test(t);
function showLinkError(msg) { linkError.textContent = msg; linkError.hidden = !msg; }
function closeLinkBox() { linkBox.hidden = true; linkTarget = null; showLinkError(''); }

function openLinkBox() {
  closeEmoji();
  const v = bodyField.value, s = bodyField.selectionStart, e = bodyField.selectionEnd;
  const existing = linkAt(v, s, e);
  const sel = v.slice(s, e);
  linkTarget = existing ? { start: existing.start, end: existing.end, existing: true } : { start: s, end: e, existing: false };
  linkText.value = existing ? existing.text : looksLikeUrl(sel) ? '' : sel;
  linkUrl.value = existing ? existing.url : looksLikeUrl(sel) ? sel : '';
  linkRemove.hidden = !existing;
  showLinkError('');
  linkBox.hidden = false;
  (linkText.value ? linkUrl : linkText).focus(); // tekst al bekend: naar het adres, anders eerst de tekst
}

function applyLink() {
  const raw = linkUrl.value.trim();
  if (!raw) return showLinkError('Vul een adres in');
  const url = normalizeUrl(raw);
  if (!url) return showLinkError('Gebruik een http(s)- of mailto-adres');
  const label = linkText.value.trim();
  const md = label ? `[${escLabel(label)}](${url})` : url.startsWith('mailto:') ? `[${escLabel(url.slice(7))}](${url})` : url;
  const { start, end } = linkTarget;
  closeLinkBox();
  replaceRange(start, end, md, start + md.length, start + md.length);
}

function removeLink() {
  const { start, end } = linkTarget;
  const plain = linkText.value;
  closeLinkBox();
  replaceRange(start, end, plain, start, start + plain.length);
}

document.getElementById('linkApply').addEventListener('click', applyLink);
document.getElementById('linkCancel').addEventListener('click', () => { closeLinkBox(); bodyField.focus(); });
linkRemove.addEventListener('click', removeLink);
linkBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLinkBox(); bodyField.focus(); } // sluit alleen het linkveld, niet de dialoog
});
bodyField.addEventListener('input', () => { if (!linkBox.hidden) closeLinkBox(); });
dialog.addEventListener('close', closeLinkBox);

// URL plakken over geselecteerde tekst maakt er een link van
bodyField.addEventListener('paste', (e) => {
  const s = bodyField.selectionStart, e2 = bodyField.selectionEnd;
  const sel = bodyField.value.slice(s, e2), pasted = (e.clipboardData?.getData('text') || '').trim();
  if (s === e2 || sel.includes('\n') || !/^https?:\/\/\S+$/i.test(pasted)) return;
  e.preventDefault();
  const md = `[${escLabel(sel)}](${normalizeUrl(pasted)})`;
  replaceRange(s, e2, md, s + md.length, s + md.length);
});

/* ---------- Emoji-kiezer: raster van 6 kolommen x 5 rijen met veelgebruikte emoji ---------- */
const EMOJI = [
  ['👍', 'duim omhoog'], ['✅', 'klaar'], ['❌', 'fout'], ['⚠️', 'waarschuwing'], ['🔥', 'vuur'], ['⭐', 'ster'],
  ['💡', 'idee'], ['📌', 'pin'], ['📅', 'kalender'], ['⏰', 'wekker'], ['⏳', 'zandloper'], ['🎯', 'doel'],
  ['🚀', 'raket'], ['🐛', 'bug'], ['🌐', 'wereldbol'], ['🔒', 'slot'], ['🔧', 'moersleutel'], ['🎉', 'feest'],
  ['📞', 'telefoon'], ['✉️', 'envelop'], ['🏠', 'huis'], ['💰', 'geld'], ['🙏', 'dank'], ['👀', 'ogen'],
  ['❤️', 'hart'], ['😀', 'lachend gezicht'], ['😂', 'lachen om te huilen'], ['🤔', 'nadenkend gezicht'], ['🤢', 'misselijk gezicht'], ['🤯', 'hoofd explodeert'],
];
const EMOJI_COLS = 6;
const emojiPop = document.getElementById('emojiPop'), emojiBtn = document.getElementById('emojiBtn');
let emojiRange = null;
for (const [ch, name] of EMOJI) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = ch; b.title = name; b.setAttribute('aria-label', name);
  emojiPop.appendChild(b);
}

function closeEmoji() {
  emojiPop.hidden = true;
  emojiBtn.setAttribute('aria-expanded', 'false');
  emojiRange = null;
}

function openEmoji() {
  closeLinkBox();
  emojiRange = [bodyField.selectionStart, bodyField.selectionEnd];
  emojiPop.hidden = false;
  emojiBtn.setAttribute('aria-expanded', 'true');
  const field = emojiPop.parentElement, bar = emojiBtn.parentElement;
  emojiPop.style.top = bar.offsetTop + bar.offsetHeight + 4 + 'px';
  emojiPop.style.left = Math.max(0, Math.min(emojiBtn.offsetLeft, field.clientWidth - emojiPop.offsetWidth)) + 'px';
  emojiPop.querySelector('button').focus();
}

function toggleEmoji() { emojiPop.hidden ? openEmoji() : closeEmoji(); }

emojiPop.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !emojiRange) return;
  const [s, e2] = emojiRange, ch = b.textContent;
  closeEmoji();
  replaceRange(s, e2, ch, s + ch.length, s + ch.length);
});
emojiPop.addEventListener('keydown', (e) => {
  const btns = [...emojiPop.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
  const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: EMOJI_COLS, ArrowUp: -EMOJI_COLS }[e.key];
  if (move !== undefined) {
    e.preventDefault();
    const n = i + move;
    if (n >= 0 && n < btns.length) btns[n].focus();
  } else if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation(); // sluit alleen de kiezer, niet de dialoog
    closeEmoji(); bodyField.focus();
  } else if (e.key === 'Tab') {
    closeEmoji();
  }
});
document.addEventListener('pointerdown', (e) => {
  if (!emojiPop.hidden && !e.target.closest('#emojiPop, #emojiBtn')) closeEmoji();
});
dialog.addEventListener('close', closeEmoji);

const FORMATS = {
  link: openLinkBox,
  emoji: toggleEmoji,
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
  const fmt = { b: 'bold', i: 'italic', u: 'underline', k: 'link' }[e.key.toLowerCase()];
  if (fmt) { e.preventDefault(); FORMATS[fmt](); }
});
