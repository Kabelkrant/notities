#!/usr/bin/env python3
"""Zet Tiptap (en ProseMirror) als vaste, lokale bestanden in public/assets/vendor/tiptap/.

De bestanden komen als voorgebouwde ES-modules van jsDelivr (versie vast, zie VERSION hieronder). Alle onderlinge verwijzingen
(/npm/<pakket>@<versie>/+esm) worden naar lokale bestanden herschreven, zodat de app bij het laden geen externe server gebruikt.
Daarna schrijft het script index.js met de exports die de app nodig heeft, en VERSIONS.txt met de sha256 van elk bestand.

Gebruik: python3 tools/vendor-tiptap.py   (alleen nodig om de versie bij te werken; het resultaat staat in git)
"""
import hashlib, os, re, sys, urllib.request

VERSION = '3.32.0'
CDN = 'https://cdn.jsdelivr.net'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'vendor', 'tiptap')
ENTRY = {  # export-naam -> pakket
    'Editor': '@tiptap/core', 'Extension': '@tiptap/core', 'getMarkRange': '@tiptap/core',
    'Document': '@tiptap/extension-document', 'Paragraph': '@tiptap/extension-paragraph', 'Text': '@tiptap/extension-text',
    'Bold': '@tiptap/extension-bold', 'Italic': '@tiptap/extension-italic', 'Underline': '@tiptap/extension-underline',
    'Link': '@tiptap/extension-link', 'HardBreak': '@tiptap/extension-hard-break', 'HorizontalRule': '@tiptap/extension-horizontal-rule',
    'BulletList': '@tiptap/extension-list', 'OrderedList': '@tiptap/extension-list', 'ListItem': '@tiptap/extension-list', 'ListKeymap': '@tiptap/extension-list',
    'UndoRedo': '@tiptap/extensions', 'Dropcursor': '@tiptap/extensions', 'Gapcursor': '@tiptap/extensions', 'Placeholder': '@tiptap/extensions',
}
REF = re.compile(r'"(/npm/[^"]+?/\+esm)"')
raw = {}  # pad op de CDN -> bronnen zoals gedownload

def fetch(path):
    with urllib.request.urlopen(urllib.request.Request(CDN + path, headers={'User-Agent': 'vendor-tiptap'}), timeout=60) as r:
        return r.read().decode('utf-8')

def crawl(path):
    if path in raw: return
    raw[path] = fetch(path)
    for ref in set(REF.findall(raw[path])):
        crawl(ref)

def split(path):  # /npm/prosemirror-model@1.25.4/+esm -> ('prosemirror-model', '1.25.4'); @tiptap/pm@3/model -> ('@tiptap/pm/model', '3.32.0')
    body = path[len('/npm/'):-len('/+esm')]
    m = re.match(r'^((?:@[^/@]+/)?[^/@]+)@([^/]+)(/.*)?$', body)
    return m.group(1) + (m.group(3) or ''), m.group(2)

def vkey(v):
    nums = re.findall(r'\d+', v)
    return tuple(int(n) for n in nums) if re.match(r'^\d', v) else (-1,)  # een bereik als ^2.0.0 telt als laagste: het wordt vervangen

# Eén exemplaar per pakket: ProseMirror werkt alleen goed als model, state, view en transform maar één keer geladen zijn.
def canonical():
    best = {}
    for path in raw:
        name, ver = split(path)
        if name not in best or vkey(ver) > vkey(best[name][1]): best[name] = (path, ver)
    return {path: best[split(path)[0]][0] for path in raw}

def local(path):  # /npm/@tiptap/core@3.32.0/+esm -> tiptap-core@3.32.0.js
    return path[len('/npm/'):-len('/+esm')].replace('@tiptap/', 'tiptap-').replace('/', '--') + '.js'

os.makedirs(OUT, exist_ok=True)
by_pkg = {}
for name, pkg in ENTRY.items():
    by_pkg.setdefault(pkg, []).append(name)
entries = {pkg: f'/npm/{pkg}@{VERSION}/+esm' for pkg in by_pkg}
for path in entries.values():
    crawl(path)
canon = canonical()

def deps(path):
    return {canon[r] for r in REF.findall(raw[path])}
reach, todo = set(), [canon[p] for p in entries.values()]
while todo:
    p = todo.pop()
    if p in reach: continue
    reach.add(p); todo.extend(deps(p))
for path in reach:
    src = REF.sub(lambda m: '"./' + local(canon[m.group(1)]) + '"', raw[path])
    src = re.sub(r'\n?//# sourceMappingURL=\S+', '', src)
    with open(os.path.join(OUT, local(path)), 'w', encoding='utf-8') as f:
        f.write(src)
lines = [f'// Gegenereerd door tools/vendor-tiptap.py (Tiptap {VERSION}); niet met de hand aanpassen.']
for pkg, names in by_pkg.items():
    lines.append('export { ' + ', '.join(names) + " } from './" + local(canon[entries[pkg]]) + "';")
with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')
files = sorted(local(p) for p in reach)
with open(os.path.join(OUT, 'VERSIONS.txt'), 'w', encoding='utf-8') as f:
    f.write(f'Tiptap {VERSION} via {CDN} (voorgebouwde ES-modules, herschreven naar lokale verwijzingen, één exemplaar per pakket)\n\n')
    for p in files:
        f.write(hashlib.sha256(open(os.path.join(OUT, p), 'rb').read()).hexdigest() + '  ' + p + '\n')
print(len(files), 'bestanden,', sum(os.path.getsize(os.path.join(OUT, p)) for p in files) // 1024, 'KB')
