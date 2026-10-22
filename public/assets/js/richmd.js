// Markdown <-> Tiptap-document voor de visuele editor van de notitie-app.
// De notitie blijft als Markdown opgeslagen (zoals het canvas en Parsedown die kennen); deze module vertaalt alleen de beperkte opmaak die de
// editor aankan: alinea's met regeleinden, dik, cursief, onderstrepen (++), links, opsommingen, genummerde lijsten (ook genest) en een horizontale lijn.
// Alles daarbuiten (koppen, code, tabellen, citaten, HTML, afbeeldingen, ...) markeert parseMarkdown als `unsupported`; zo'n notitie opent in de
// gewone Markdown-editor, zodat er nooit opmaak stilletjes verdwijnt.

const LIST = /^( *)([-*+]|\d{1,9}[.)])( +)(.*)$/;
const HR = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const BLOCK_OTHER = [
  /^ {0,3}#{1,6}(\s|$)/,              // kop
  /^ {0,3}(```|~~~)/,                 // codeblok
  /^ {0,3}>/,                         // citaat
  /^ {0,3}<[a-zA-Z!/]/,               // HTML
  /^ {0,3}\[[^\]]+\]:\s*\S/,          // verwijzingsdefinitie
  /^ {0,3}\|/,                        // tabel
];

const RANK = { link: 0, bold: 1, italic: 2, underline: 3 }; // vaste volgorde van opmaak, ook bij het terugschrijven
const textNode = (text, marks) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((m) => ({ ...m })).sort((a, b) => RANK[a.type] - RANK[b.type]) } : {}) });

/* ---------- Markdown -> document ---------- */

// Zoekt het sluitteken voor dik/cursief/onderstrepen: niet direct na witruimte, niet direct voor het begin, met inhoud ertussen
function findClose(s, from, marker) {
  if (from >= s.length || /\s/.test(s[from])) return -1;
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s.startsWith(marker, j) && j > from && !/\s/.test(s[j - 1])) {
      if (marker.length === 1 && s[j + 1] === marker) { j++; continue; } // een enkel teken is geen deel van een dubbel
      return j;
    }
  }
  return -1;
}

function parseInline(s, marks, flags) {
  if (/\*\*\*|___/.test(s)) flags.unsupported = true; // dik + cursief in één: laten we aan de Markdown-editor over
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push(textNode(buf, marks)); buf = ''; } };
  const hasLink = marks.some((m) => m.type === 'link');
  let i = 0;
  while (i < s.length) {
    const c = s[i], rest = s.slice(i);
    if (c === '\\' && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!>~|<]/.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    const twin = (c === '+' || c === '*' || c === '_') && s[i + 1] === c;
    if (twin) {
      const end = findClose(s, i + 2, c + c);
      if (end > 0 && (c !== '_' || !/\w/.test(s[i - 1] || ' '))) {
        flush();
        out.push(...parseInline(s.slice(i + 2, end), [...marks, { type: c === '+' ? 'underline' : 'bold' }], flags));
        i = end + 2; continue;
      }
    } else if (c === '*' || c === '_') {
      const end = findClose(s, i + 1, c);
      const intraword = c === '_' && (/\w/.test(s[i - 1] || ' ') || /\w/.test(s[end + 1] || ' ')); // snake_case is geen cursief
      if (end > 0 && !intraword) {
        flush();
        out.push(...parseInline(s.slice(i + 1, end), [...marks, { type: 'italic' }], flags));
        i = end + 1; continue;
      }
    }
    if (c === '[' && !hasLink) {
      let depth = 0, j = i;
      for (; j < s.length; j++) {
        if (s[j] === '\\') { j++; continue; }
        if (s[j] === '[') depth++;
        else if (s[j] === ']' && --depth === 0) break;
      }
      if (j < s.length && s[j + 1] === '(') {
        const close = s.indexOf(')', j + 2);
        if (close > 0) {
          const target = s.slice(j + 2, close).trim();
          if (/\s/.test(target)) flags.unsupported = true; // met titel of spaties
          else if (/^(https?:\/\/|mailto:)/i.test(target)) {
            flush();
            out.push(...parseInline(s.slice(i + 1, j), [...marks, { type: 'link', attrs: { href: target } }], flags));
            i = close + 1; continue;
          } else flags.unsupported = true; // een relatieve of andere link
        }
      } else if (j < s.length && s[j + 1] === '[') flags.unsupported = true; // verwijzingslink
    }
    if (!hasLink && (c === 'h' || c === 'H' || c === 'w' || c === 'W') && (i === 0 || /[\s(]/.test(s[i - 1]))) {
      const m = /^(https?:\/\/|www\.)[^\s<]+/i.exec(rest);
      if (m) {
        let url = m[0];
        while (/[.,;:!?'"*_\]]$/.test(url) || (url.endsWith(')') && !url.includes('('))) url = url.slice(0, -1);
        if (url.length > (m[1].length)) {
          flush();
          out.push(textNode(url, [...marks, { type: 'link', attrs: { href: /^www\./i.test(url) ? 'https://' + url : url } }]));
          i += url.length; continue;
        }
      }
    }
    if (c === '`' || (c === '~' && s[i + 1] === '~') || (c === '!' && s[i + 1] === '[') || (c === '<' && /^<(\/?[a-zA-Z!]|https?:)/.test(rest))) flags.unsupported = true;
    buf += c; i++;
  }
  flush();
  return out;
}

function inlineLines(lines, flags) { // regels met een regeleinde ertussen (de server zet elke regelovergang om in <br>)
  const out = [];
  lines.forEach((line, k) => {
    if (k) out.push({ type: 'hardBreak' });
    out.push(...parseInline(line, [], flags));
  });
  return out;
}

const para = (content) => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });

export function parseMarkdown(md) {
  const flags = { unsupported: false };
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const blank = (l) => /^\s*$/.test(l);
  const doc = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    if (HR.test(line)) { doc.push({ type: 'horizontalRule' }); i++; continue; }
    if (BLOCK_OTHER.some((re) => re.test(line))) flags.unsupported = true;
    const lm = LIST.exec(line);
    if (lm) { i = parseList(lines, i, doc, flags); continue; }
    if (/^ {4,}\S/.test(line)) flags.unsupported = true; // ingesprongen codeblok
    const buf = [];
    while (i < lines.length && !blank(lines[i]) && !(buf.length && (LIST.test(lines[i]) || HR.test(lines[i])))) {
      if (buf.length && /^ {0,3}(=+|-+) *$/.test(lines[i])) flags.unsupported = true; // kop met onderstreping
      if (BLOCK_OTHER.some((re) => re.test(lines[i]))) flags.unsupported = true;
      if (i + 1 < lines.length && /\|/.test(lines[i]) && /^[\s|:-]+$/.test(lines[i + 1]) && /-/.test(lines[i + 1]) && /\|/.test(lines[i + 1])) flags.unsupported = true; // tabel
      buf.push(lines[i].trim()); i++;
    }
    doc.push(para(inlineLines(buf, flags)));
  }
  if (!doc.length) doc.push({ type: 'paragraph' });
  return { doc: { type: 'doc', content: doc }, unsupported: flags.unsupported };
}

// Een aaneengesloten lijst (met geneste lijsten op basis van inspringing) -> lijstknopen; geeft de volgende regelindex terug
function parseList(lines, start, doc, flags) {
  const items = [];
  const blank = (l) => /^\s*$/.test(l);
  let j = start;
  while (j < lines.length) {
    const l = lines[j];
    if (blank(l)) {
      let k = j + 1;
      while (k < lines.length && blank(lines[k])) k++;
      if (k < lines.length && LIST.test(lines[k]) && !HR.test(lines[k])) { flags.unsupported = true; j = k; continue; } // lijst met witregels: een 'losse' lijst, anders opgemaakt
      break;
    }
    if (HR.test(l)) break;
    const m = LIST.exec(l);
    if (m) { items.push({ indent: m[1].length, ordered: /\d/.test(m[2][0]), number: parseInt(m[2], 10), lines: [m[4].trim()] }); j++; continue; }
    if (!items.length) break;
    if (BLOCK_OTHER.some((re) => re.test(l))) flags.unsupported = true;
    items[items.length - 1].lines.push(l.trim()); j++; // vervolgregel van het vorige item
  }
  const stack = []; // {indent, ordered, list, item (laatste item)}
  for (const it of items) {
    const type = it.ordered ? 'orderedList' : 'bulletList';
    while (stack.length && it.indent < stack[stack.length - 1].indent) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || it.indent > top.indent || top.ordered !== it.ordered) {
      const list = { type, ...(it.ordered ? { attrs: { start: it.number } } : {}), content: [] };
      if (top && it.indent > top.indent) top.item.content.push(list); // geneste lijst binnen het laatste item
      else {
        if (top) stack.pop();
        const parent = stack[stack.length - 1];
        if (parent) parent.item.content.push(list); else doc.push(list);
      }
      top = { indent: it.indent, ordered: it.ordered, list, item: null };
      stack.push(top);
    }
    const item = { type: 'listItem', content: [para(inlineLines(it.lines, flags))] };
    top.list.content.push(item);
    top.item = item;
  }
  return j;
}

/* ---------- Document -> Markdown ---------- */

const ORDER = ['link', 'bold', 'italic', 'underline'];
const MARKERS = { bold: '**', italic: '*', underline: '++' };

function escapeText(t) {
  return t
    .replace(/\\/g, '\\\\')
    .replace(/[[\]`]/g, '\\$&')
    .replace(/\+\+/g, '\\+\\+')
    .replace(/\*/g, '\\*') // een sterretje altijd vooraf laten gaan door een backslash: Parsedown zoekt er anders een sluitend sterretje bij
    .replace(/_/g, (m, off, str) => (/\w/.test(str[off - 1] || ' ') && /\w/.test(str[off + 1] || ' ') ? m : '\\_')); // snake_case blijft staan
}

function segments(nodes) {
  const segs = [];
  for (const n of nodes) {
    if (n.type === 'hardBreak') { segs.push({ br: true }); continue; }
    if (n.type !== 'text' || !n.text) continue;
    const present = (t) => n.marks?.find((m) => m.type === t);
    const marks = ORDER.filter(present).map((t) => ({ type: t, href: t === 'link' ? present('link').attrs?.href : undefined }));
    segs.push({ text: n.text, marks });
  }
  return segs;
}

function emitMarked(segs) { // dik, cursief en onderstrepen over een rij segmenten; witruimte aan de randen van een opmaak komt er altijd buiten te staan
  let out = '', open = [], pending = []; // open: markeringen al geschreven; pending: geopend maar nog zonder inhoud
  const close = (keep) => {
    while (open.length + pending.length > keep) {
      if (pending.length) { pending.pop(); continue; }
      const m = open.pop(), tail = /\s*$/.exec(out)[0];
      out = out.slice(0, out.length - tail.length) + MARKERS[m.type] + tail;
    }
  };
  for (const seg of segs) {
    if (seg.br) { close(0); out += '\n'; continue; }
    const want = seg.marks.filter((m) => m.type !== 'link'), have = [...open, ...pending];
    let k = 0;
    while (k < have.length && k < want.length && have[k].type === want[k].type) k++;
    close(k);
    pending.push(...want.slice(k));
    const esc = escapeText(seg.text), lead = /^\s*/.exec(esc)[0], core = esc.slice(lead.length);
    if (!core) { out += esc; continue; }
    out += lead;
    if (pending.length) { out += pending.map((m) => MARKERS[m.type]).join(''); open.push(...pending); pending = []; }
    out += core;
  }
  close(0);
  return out;
}

function serializeInline(nodes) {
  const segs = segments(nodes), out = [];
  for (let k = 0; k < segs.length;) {
    const link = segs[k].marks?.find((m) => m.type === 'link');
    if (!link) { out.push(segs[k]); k++; continue; }
    const run = [];
    while (k < segs.length && segs[k].marks?.some((m) => m.type === 'link' && m.href === link.href)) { run.push(segs[k]); k++; }
    const plain = run.map((s) => s.text).join('');
    const bare = run.every((s) => s.marks.length === 1) && (plain === link.href || (/^www\./i.test(plain) && 'https://' + plain === link.href));
    const href = (link.href || '').replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
    out.push({ raw: bare ? plain : '[' + emitMarked(run) + '](' + href + ')' });
  }
  // aaneengesloten niet-link-segmenten samen verwerken zodat opmaak over de randen van links heen netjes sluit
  let md = '', pending = [];
  const flush = () => { if (pending.length) { md += emitMarked(pending); pending = []; } };
  for (const s of out) { if (s.raw !== undefined) { flush(); md += s.raw; } else pending.push(s); }
  flush();
  return md;
}

function escapeLineStart(line) {
  return line.replace(/^\s+/, '')
    .replace(/^(#{1,6})(?=\s|$)/, '\\$1')
    .replace(/^>/, '\\>')
    .replace(/^([-+*])(?=\s)/, '\\$1')
    .replace(/^(\d+)([.)])(?=\s)/, '$1\\$2')
    .replace(/^(=+|-+)\s*$/, (m) => '\\' + m);
}

function paragraphLines(node) {
  const md = serializeInline(node.content || []);
  return md.split('\n').map((l) => escapeLineStart(l.replace(/\s+$/, ''))).filter((l, idx, arr) => l !== '' || idx > 0 && idx < arr.length - 1);
}

function serializeList(node, depth) {
  const ordered = node.type === 'orderedList';
  const start = node.attrs?.start ?? 1;
  const lines = [];
  (node.content || []).forEach((item, idx) => {
    const marker = ordered ? `${start + idx}. ` : '- ';
    const own = [], nested = [];
    for (const child of item.content || []) {
      if (child.type === 'paragraph') own.push(...paragraphLines(child));
      else if (child.type === 'bulletList' || child.type === 'orderedList') nested.push(serializeList(child, depth + 1));
    }
    if (!own.length) own.push('');
    lines.push(marker + own[0]);
    for (const l of own.slice(1)) lines.push(' '.repeat(marker.length) + l);
    for (const n of nested) for (const l of n.split('\n')) lines.push('    ' + l);
  });
  return lines.join('\n');
}

export function serializeDoc(doc) {
  const blocks = [];
  for (const node of doc?.content || []) {
    if (node.type === 'paragraph') { const l = paragraphLines(node); if (l.length) blocks.push(l.join('\n')); }
    else if (node.type === 'horizontalRule') blocks.push('---');
    else if (node.type === 'bulletList' || node.type === 'orderedList') blocks.push(serializeList(node, 0));
  }
  return blocks.join('\n\n').trim();
}

/* ---------- Veilig openen: past de notitie in de visuele editor? ---------- */

// Voegt aangrenzende tekst met dezelfde opmaak samen, zodat twee documenten met dezelfde inhoud gelijk zijn
function normalize(node) {
  if (!node.content) return node;
  const out = [];
  for (const c of node.content.map(normalize)) {
    const prev = out[out.length - 1];
    if (c.type === 'text' && prev?.type === 'text' && JSON.stringify(prev.marks || []) === JSON.stringify(c.marks || [])) prev.text += c.text;
    else out.push({ ...c });
  }
  return { ...node, content: out };
}

// true als de notitie zonder verlies in de visuele editor kan: geen onbekende opmaak, en heen-en-weer vertalen verandert niets aan de inhoud
export function canEditVisually(md) {
  const first = parseMarkdown(md);
  if (first.unsupported) return false;
  const again = parseMarkdown(serializeDoc(first.doc));
  return !again.unsupported && JSON.stringify(normalize(first.doc)) === JSON.stringify(normalize(again.doc));
}
