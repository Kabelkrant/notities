<?php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
start_session();
send_robots_header();

$notes = all_notes();
$boot = [
    'csrf' => csrf_token(),
    'version' => notes_version($notes),
    'notes' => $notes,
];
$v = fn(string $f): int => (int)@filemtime(__DIR__ . '/' . $f);
?>
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#14161c" media="(prefers-color-scheme: dark)">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>Notities</title>
  <link rel="icon" type="image/png" href="sticky-note.png">
  <link rel="stylesheet" href="assets/app.css?v=<?= $v('assets/app.css') ?>">
  <base target="_blank">
</head>
<body>
  <h1 class="sr-only">Kabelkrant Notities</h1>
  <div class="toolbar">
    <span id="status" class="status" role="status" aria-live="polite"></span>
    <div class="split">
      <button id="newBtn" type="button" class="primary" aria-haspopup="menu" aria-expanded="false" aria-controls="newMenu">+ Nieuw</button>
      <div id="newMenu" class="menu" role="menu" hidden>
        <button type="button" role="menuitem" id="newNote">🗒️ Notitie</button>
        <button type="button" role="menuitem" id="newImage">🖼️ Afbeelding</button>
      </div>
    </div>
    <input type="file" id="imageInput" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden>
  </div>

  <main class="board" id="board" aria-label="Notitiebord"></main>

  <dialog id="noteDialog">
    <form id="noteForm" method="dialog" target="_self">
      <h2 id="dialogTitle">Nieuwe notitie</h2>
      <input type="hidden" name="id">
      <label>Titel <input type="text" name="title" maxlength="255" required></label>
      <label>Kleur
        <span class="swatches" id="swatches"></span>
        <input type="color" name="color" value="#FFF59D">
      </label>
      <div class="field">
        <span class="field-label">Notitie</span>
        <div class="fmt-bar" role="toolbar" aria-label="Opmaak" aria-controls="bodyField">
          <button type="button" data-fmt="bold" title="Dik (Ctrl+B)" aria-label="Dik"><b>B</b></button>
          <button type="button" data-fmt="italic" title="Cursief (Ctrl+I)" aria-label="Cursief"><i>I</i></button>
          <button type="button" data-fmt="underline" title="Onderstrepen (Ctrl+U)" aria-label="Onderstrepen"><u>U</u></button>
          <span class="fmt-sep" aria-hidden="true"></span>
          <button type="button" data-fmt="bullets" title="Opsomming" aria-label="Opsomming">• ≡</button>
          <button type="button" data-fmt="numbers" title="Genummerde lijst" aria-label="Genummerde lijst">1. ≡</button>
        </div>
        <textarea id="bodyField" name="body" maxlength="20000" required aria-label="Notitie"></textarea>
      </div>
      <p class="error" id="formError" hidden></p>
      <menu>
        <button type="button" id="cancelBtn">Annuleren</button>
        <button type="submit" class="primary">Opslaan</button>
      </menu>
    </form>
  </dialog>

  <div id="toast" class="toast" role="status" aria-live="polite" hidden>
    <span id="toastText"></span>
    <button type="button" id="toastAction">Ongedaan maken</button>
  </div>

  <script id="boot" type="application/json"><?= json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
  <script src="assets/app.js?v=<?= $v('assets/app.js') ?>" type="module"></script>
</body>
</html>
