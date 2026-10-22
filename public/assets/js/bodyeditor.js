import { createRich } from './rich.js';
import { canEditVisually } from './richmd.js';

// De tekst van een notitie bewerken met de visuele editor (Tiptap), of, voor notities met opmaak die die niet kent, met de Markdown-editor.
// `plainField` is het bestaande veld met de opmaakbalk en de textarea (al aangesloten op setupEditor uit format.js); hiervoor komt een kopie
// zonder textarea met de visuele editor, plus een melding voor als de Markdown-editor wordt gebruikt. Eén van de twee is steeds zichtbaar.
export function createBodyEditor({ plainField, textarea, onInput, onBlur }) {
  const richField = plainField.cloneNode(true);
  richField.querySelector('.fmt-bar').removeAttribute('aria-controls');
  richField.querySelector('textarea').replaceWith(Object.assign(document.createElement('div'), { className: 'na-rich' }));
  for (const el of richField.querySelectorAll('[id]')) el.removeAttribute('id'); // geen dubbele id's
  const notice = Object.assign(document.createElement('p'), { className: 'na-notice', hidden: true, textContent: 'Deze notitie bevat opmaak die de visuele editor niet kent. Je bewerkt daarom de Markdown-tekst.' });
  plainField.before(notice, richField);
  const rich = createRich(richField, { onInput, onBlur });
  let visual = true;

  return {
    // Kiest de editor: visueel als de notitie er zonder verlies in past; `selection` zet de cursor terug ({from, to})
    load(md, selection) {
      visual = canEditVisually(md);
      richField.hidden = !visual; plainField.hidden = visual; notice.hidden = visual;
      if (visual) rich.load(md, selection);
      else {
        rich.destroy();
        textarea.value = md;
        if (selection) textarea.setSelectionRange(Math.min(selection.from, md.length), Math.min(selection.to, md.length));
      }
    },
    getValue: () => (visual ? rich.getMarkdown() : textarea.value),
    selection: () => (visual ? rich.selection() : { from: textarea.selectionStart, to: textarea.selectionEnd }),
    focus: () => (visual ? rich.focus() : textarea.focus()),
    destroy: () => rich.destroy(),
    get visual() { return visual; },
  };
}
