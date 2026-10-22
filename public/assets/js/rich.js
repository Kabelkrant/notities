import {
  Editor, Extension, getMarkRange, Document, Paragraph, Text, Bold, Italic, Underline, Link, HardBreak, HorizontalRule,
  BulletList, OrderedList, ListItem, ListKeymap, UndoRedo, Dropcursor, Gapcursor, Placeholder,
} from '../vendor/tiptap/index.js';
import { parseMarkdown, serializeDoc } from './richmd.js';
import { EMOJI, EMOJI_COLS, normalizeUrl, looksLikeUrl } from './format.js';

// Visuele editor (Tiptap) voor de notitie-app. De opmaakbalk, het linkvenster en de emojikiezer zijn dezelfde elementen als in het
// notitievenster op het canvas (`field` is een kopie daarvan met een lege `.na-rich` in plaats van de textarea). De notitie blijft als
// Markdown opgeslagen: load() vertaalt Markdown naar het document, getMarkdown() terug (zie richmd.js).
export function createRich(field, { onInput, onBlur }) {
  const mount = field.querySelector('.na-rich'), bar = field.querySelector('.fmt-bar');
  const linkBox = field.querySelector('.link-box'), linkText = field.querySelector('.link-text'), linkUrl = field.querySelector('.link-url');
  const linkError = field.querySelector('.link-error'), linkRemove = field.querySelector('.link-remove');
  const emojiPop = field.querySelector('.emoji-pop'), emojiBtn = field.querySelector('[data-fmt="emoji"]');
  let editor = null, linkRange = null;

  const extensions = () => [
    Document, Paragraph, Text, Bold, Italic, Underline, HardBreak, HorizontalRule, BulletList, OrderedList, ListItem, ListKeymap,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, protocols: ['http', 'https', 'mailto'], defaultProtocol: 'https', HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } }),
    UndoRedo, Dropcursor, Gapcursor, Placeholder.configure({ placeholder: 'Schrijf hier je notitie…' }),
    Extension.create({ name: 'linkShortcut', addKeyboardShortcuts: () => ({ 'Mod-k': () => { openLinkBox(); return true; } }) }), // Ctrl+K: link toevoegen of bewerken
  ];

  /* ---------- Toolbar ---------- */
  const COMMANDS = {
    bold: (c) => c.toggleBold(), italic: (c) => c.toggleItalic(), underline: (c) => c.toggleUnderline(),
    bullets: (c) => c.toggleBulletList(), numbers: (c) => c.toggleOrderedList(),
  };
  const ACTIVE = { bold: 'bold', italic: 'italic', underline: 'underline', bullets: 'bulletList', numbers: 'orderedList', link: 'link' };
  function syncBar() {
    for (const b of bar.querySelectorAll('[data-fmt]')) {
      const name = ACTIVE[b.dataset.fmt];
      if (name) b.setAttribute('aria-pressed', String(!!editor?.isActive(name)));
    }
  }
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // de focus blijft in de editor
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]');
    if (!b || !editor) return;
    const fmt = b.dataset.fmt;
    if (COMMANDS[fmt]) COMMANDS[fmt](editor.chain().focus()).run();
    else if (fmt === 'link') openLinkBox();
    else if (fmt === 'emoji') emojiPop.hidden ? openEmoji() : closeEmoji();
  });

  /* ---------- Link: tekst en adres, of een bestaande link bewerken ---------- */
  const showLinkError = (msg) => { linkError.textContent = msg; linkError.hidden = !msg; };
  function closeLinkBox() { linkBox.hidden = true; linkRange = null; showLinkError(''); }
  function openLinkBox() {
    closeEmoji();
    const { state } = editor, { from, to, empty } = state.selection;
    const mark = getMarkRange(state.doc.resolve(from), state.schema.marks.link);
    const inLink = mark && (empty || (mark.from <= from && mark.to >= to));
    const range = inLink ? { from: mark.from, to: mark.to } : { from, to };
    const text = state.doc.textBetween(range.from, range.to, ' ');
    linkRange = { ...range, existing: !!inLink };
    const href = inLink ? editor.getAttributes('link').href || '' : '';
    linkText.value = inLink ? text : looksLikeUrl(text) ? '' : text;
    linkUrl.value = inLink ? href : looksLikeUrl(text) ? text : '';
    linkRemove.hidden = !inLink;
    showLinkError('');
    linkBox.hidden = false;
    (linkText.value ? linkUrl : linkText).focus();
  }
  function applyLink() {
    const raw = linkUrl.value.trim();
    if (!raw) return showLinkError('Vul een adres in');
    const url = normalizeUrl(raw);
    if (!url) return showLinkError('Gebruik een http(s)- of mailto-adres');
    const { from, to } = linkRange, current = editor.state.doc.textBetween(from, to, ' ');
    const label = linkText.value.trim() || (from !== to ? current : url.startsWith('mailto:') ? url.slice(7) : raw);
    closeLinkBox();
    if (from !== to && label === current) editor.chain().focus().setTextSelection({ from, to }).setLink({ href: url }).run(); // zelfde tekst: alleen de link erover, andere opmaak blijft
    else editor.chain().focus().insertContentAt({ from, to }, { type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] }).run();
  }
  function removeLink() {
    const { from, to } = linkRange;
    closeLinkBox();
    editor.chain().focus().setTextSelection({ from, to }).unsetLink().run();
  }
  field.querySelector('.link-apply').addEventListener('click', applyLink);
  field.querySelector('.link-cancel').addEventListener('click', () => { closeLinkBox(); editor?.commands.focus(); });
  linkRemove.addEventListener('click', removeLink);
  linkBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLinkBox(); editor?.commands.focus(); }
  });

  /* ---------- Emoji ---------- */
  emojiPop.replaceChildren(...EMOJI.map(([ch, name]) => Object.assign(document.createElement('button'), { type: 'button', textContent: ch, title: name, ariaLabel: name })));
  function closeEmoji() { emojiPop.hidden = true; emojiBtn.setAttribute('aria-expanded', 'false'); }
  function openEmoji() {
    closeLinkBox();
    emojiPop.hidden = false;
    emojiBtn.setAttribute('aria-expanded', 'true');
    emojiPop.style.top = bar.offsetTop + bar.offsetHeight + 4 + 'px';
    emojiPop.style.left = Math.max(0, Math.min(emojiBtn.offsetLeft, field.clientWidth - emojiPop.offsetWidth)) + 'px';
    emojiPop.querySelector('button').focus();
  }
  emojiPop.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    closeEmoji();
    editor.chain().focus().insertContent(b.textContent).run();
  });
  emojiPop.addEventListener('keydown', (e) => {
    const btns = [...emojiPop.querySelectorAll('button')], i = btns.indexOf(document.activeElement);
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: EMOJI_COLS, ArrowUp: -EMOJI_COLS }[e.key];
    if (move !== undefined) { e.preventDefault(); btns[i + move]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEmoji(); editor?.commands.focus(); }
    else if (e.key === 'Tab') closeEmoji();
  });
  document.addEventListener('pointerdown', (e) => { if (!emojiPop.hidden && !e.target.closest('.emoji-pop, [data-fmt="emoji"]')) closeEmoji(); });

  /* ---------- Editor ---------- */
  function destroy() {
    closeLinkBox(); closeEmoji();
    editor?.destroy();
    editor = null;
  }

  // Opent de Markdown in een nieuwe editor (zo begint ook de ongedaan-maken-geschiedenis opnieuw); `selection` herstelt de cursor
  function load(md, selection) {
    destroy();
    const { doc } = parseMarkdown(md);
    editor = new Editor({
      element: mount, extensions: extensions(), content: doc,
      editorProps: { attributes: { class: 'na-pm', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Inhoud van de notitie' } },
      onUpdate: () => onInput?.(),
      onBlur: () => onBlur?.(),
      onSelectionUpdate: syncBar, onTransaction: syncBar,
    });
    if (selection) {
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(selection.from, max), to: Math.min(selection.to, max) });
    }
    syncBar();
  }

  return {
    load, destroy,
    getMarkdown: () => (editor ? serializeDoc(editor.getJSON()) : ''),
    selection: () => (editor ? { from: editor.state.selection.from, to: editor.state.selection.to } : null),
    focus: () => editor?.commands.focus(),
    hasFocus: () => !!editor?.isFocused,
  };
}
