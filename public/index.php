<?php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
start_session();
send_robots_header();
header('Cache-Control: private, no-store');

$authed = Auth::check();
$appName = Auth::appName();
$notes = $authed ? all_notes() : [];
$folders = $authed ? all_folders() : [];
// Zicht op het bord uit de cookie 'view' (zoom,x,y; door app geschreven); server zet het meteen, zodat de pagina niet eerst op 100% laadt.
// Oudere installaties hebben alleen de cookie 'zoom'.
$view = array_map('floatval', array_pad(array_filter(explode(',', (string)($_COOKIE['view'] ?? '')), 'is_numeric'), 3, 0));
if (!isset($_COOKIE['view']) && isset($_COOKIE['zoom']) && is_numeric($_COOKIE['zoom'])) $view = [(float)$_COOKIE['zoom'], 0.0, 0.0];
$zoom = $view[0] > 0 ? max(0.05, min(4.0, $view[0])) : 1.0;
$panX = max(-1e7, min(1e7, $view[1])); $panY = max(-1e7, min(1e7, $view[2]));
$snap = ($_COOKIE['snap'] ?? '') === '1';
// Breedte van de lijst in de notitie-app (px, cookie 'nasplit'); zonder cookie geldt de standaard van een derde
$naLeft = isset($_COOKIE['nasplit']) && ctype_digit((string)$_COOKIE['nasplit']) ? max(200, min(3000, (int)$_COOKIE['nasplit'])) : null;
$mode = $authed && ($_COOKIE['mode'] ?? '') === 'notes' ? 'notes' : 'canvas'; // weergavemodus: canvas of notitie-app (cookie 'mode', door de app geschreven)
// Drempels voor 'afbeelding te groot' (vraag om te verkleinen), uit .env; ongeldige waarden vallen terug op de standaard
$envInt = fn(string $k, int $default, int $min, int $max): int => max($min, min($max, (int)(Auth::env($k) ?: $default)));
$allow = [ // welke soorten items er nog toegevoegd mogen worden (.env: ALLOW_NOTES, ALLOW_PICTURES, ALLOW_SHAPE, ALLOW_CLOCK, ALLOW_COUNTDOWN, ALLOW_WORDART)
    'notes' => feature_enabled('NOTES'), 'pictures' => feature_enabled('PICTURES'),
    'shape' => feature_enabled('SHAPE'), 'clock' => feature_enabled('CLOCK'), 'countdown' => feature_enabled('COUNTDOWN'), 'wordart' => feature_enabled('WORDART'),
];
$boot = [
    'allow' => $allow,
    'imageMaxDim' => $envInt('IMAGE_MAX_DIMENSION', 2000, 100, 5000),
    'imageMaxBytes' => $envInt('IMAGE_MAX_KB', 2048, 50, 15 * 1024) * 1024,
    'auth' => $authed,
    'snap' => $snap,
    'mode' => $mode,
    'zoom' => $zoom,
    'panX' => $panX,
    'panY' => $panY,
    'csrf' => csrf_token(),
    'version' => notes_version($notes, $folders),
    'folders' => $folders,
    'notes' => $notes,
];
$v = fn(string $f): int => (int)@filemtime(__DIR__ . '/' . $f);
// Import map: geeft elke JS-module een ?v=<wijzigingstijd>, zodat browsers na een update geen verouderde modules gebruiken.
$imports = [];
foreach (glob(__DIR__ . '/assets/js/*.js') ?: [] as $f) {
    $rel = 'assets/js/' . basename($f);
    $imports['./' . $rel] = './' . $rel . '?v=' . $v($rel);
}
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
  <title><?= e($appName) ?></title>
  <link rel="icon" type="image/png" href="sticky-note.png">
  <link rel="stylesheet" href="assets/app.css?v=<?= $v('assets/app.css') ?>">
</head>
<body class="mode-<?= $mode ?>">
  <h1 class="sr-only"><?= e($appName) ?></h1>
<?php if ($authed): ?>
  <div class="toolbar">
    <span id="status" class="status" role="status" aria-live="polite"></span>
    <div class="split canvas-only"<?= in_array(true, $allow, true) ? '' : ' hidden' ?>>
      <button id="newBtn" type="button" class="icon-btn add-btn" title="Nieuw" aria-label="Nieuw" aria-haspopup="menu" aria-expanded="false" aria-controls="newMenu">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <div id="newMenu" class="menu" data-align="center" role="menu" hidden>
        <button type="button" role="menuitem" id="newNote"<?= $allow['notes'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">🗒️</span> Notitie</button>
        <button type="button" role="menuitem" id="newImage"<?= $allow['pictures'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">🖼️</span> Afbeelding</button>
        <button type="button" role="menuitem" id="newWordart" data-create="wordart"<?= $allow['wordart'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">🌈</span> WordArt</button>
        <button type="button" role="menuitem" id="newShape" data-create="shape"<?= $allow['shape'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">🔴</span> Vorm</button>
        <button type="button" role="menuitem" id="newClock" data-create="clock"<?= $allow['clock'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">🕐</span> Klok</button>
        <button type="button" role="menuitem" id="newCountdown" data-create="countdown"<?= $allow['countdown'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">📅</span> Afteller</button>
      </div>
    </div>
    <div class="zoom-ctl canvas-only" role="group" aria-label="Zoomen">
      <button id="zoomOut" type="button" class="icon-btn" title="Uitzoomen" aria-label="Uitzoomen">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6"/></svg>
      </button>
      <button id="zoomIn" type="button" class="icon-btn" title="Inzoomen" aria-label="Inzoomen">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6M10 7v6"/></svg>
      </button>
    </div>
    <div class="split">
      <button id="mainBtn" type="button" class="icon-btn" title="Menu" aria-label="Menu" aria-haspopup="menu" aria-expanded="false" aria-controls="mainMenu">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div id="mainMenu" class="menu" role="menu" hidden>
        <button type="button" role="menuitemradio" id="modeCanvas" data-mode="canvas" aria-checked="<?= $mode === 'canvas' ? 'true' : 'false' ?>"><span class="ico" aria-hidden="true"><span class="radio"></span></span>Canvas</button>
        <button type="button" role="menuitemradio" id="modeNotes" data-mode="notes" aria-checked="<?= $mode === 'notes' ? 'true' : 'false' ?>"><span class="ico" aria-hidden="true"><span class="radio"></span></span>Notities</button>
        <hr>
        <button type="button" role="menuitem" id="resetZoom" class="canvas-only"><span class="ico" aria-hidden="true">🔎</span> Reset zoom</button>
        <button type="button" role="menuitemcheckbox" id="snapToggle" class="canvas-only" aria-checked="<?= $snap ? 'true' : 'false' ?>"><span class="ico" aria-hidden="true"><span class="check">✓</span></span>Snap to grid</button>
        <button type="button" role="menuitem" id="logoutBtn"><span class="ico" aria-hidden="true">🔒</span> Uitloggen</button>
        <button type="button" role="menuitem" id="aboutBtn"><span class="ico" aria-hidden="true">ℹ️</span> Over</button>
      </div>
    </div>
    <input type="file" id="imageInput" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden>
  </div>

  <main id="board" class="board<?= $snap ? ' snap' : '' ?>" aria-label="Notitiebord" ><div id="world" class="world" style="transform: translate(<?= $panX ?>px, <?= $panY ?>px) scale(<?= $zoom ?>)"></div></main>

  <div id="notesApp" class="notes-app" aria-label="Notities"<?= $naLeft ? ' style="--na-left: ' . $naLeft . 'px"' : '' ?><?= $mode === 'notes' ? '' : ' hidden' ?>>
    <aside class="na-list-pane" aria-label="Lijst met notities">
      <div class="na-list-head">
        <h2>Notities</h2>
        <span class="na-list-actions">
          <button type="button" id="naNewFolder" title="Nieuwe map" aria-label="Nieuwe map">📁+</button>
          <button type="button" id="naNew" class="primary"<?= $allow['notes'] ? '' : ' hidden' ?>>+ Nieuw</button>
        </span>
      </div>
      <div class="na-list" id="naList" role="tree" aria-label="Mappen en notities"></div>
    </aside>
    <div class="na-splitter" id="naSplitter" role="separator" aria-orientation="vertical" aria-label="Breedte van de lijst" title="Sleep om de breedte te wijzigen (dubbelklik: standaard)" tabindex="0"></div>
    <section class="na-editor-pane" aria-label="Notitie">
      <p class="na-empty" id="naEmpty">Kies een notitie in de lijst of maak een nieuwe.</p>
      <div class="na-editor" id="naEditor" hidden>
        <div class="na-editor-head">
          <button type="button" id="naBack" class="na-back" aria-label="Terug naar de lijst" title="Terug naar de lijst">←</button>
          <input type="text" id="naTitle" maxlength="255" placeholder="Titel" aria-label="Titel">
          <span class="swatches" id="naSwatches" aria-label="Kleur"></span>
          <button type="button" id="naDelete" title="Verwijderen" aria-label="Verwijderen">🗑️</button>
        </div>
        <div class="na-conflict" id="naConflict" hidden>
          <span>Deze notitie is ondertussen elders gewijzigd.</span>
          <button type="button" id="naKeepMine">Mijn versie bewaren</button>
          <button type="button" id="naTakeTheirs">Hun versie laden</button>
        </div>
        <div class="na-body" id="naBodyField"></div>
        <div class="na-foot"><span id="naSaved" role="status" aria-live="polite"></span></div>
      </div>
    </section>
  </div>

  <dialog id="noteDialog">
    <form id="noteForm" method="dialog">
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
          <span class="fmt-sep" aria-hidden="true"></span>
          <button type="button" data-fmt="link" title="Link (Ctrl+K)" aria-label="Link">🔗</button>
          <button type="button" data-fmt="emoji" title="Emoji" aria-label="Emoji" aria-haspopup="true" aria-expanded="false">😀</button>
        </div>
        <div class="emoji-pop" role="group" aria-label="Emoji" hidden></div>
        <div class="link-box" hidden>
          <label>Tekst <input type="text" class="link-text" autocomplete="off" placeholder="Zichtbare tekst (leeg = het adres zelf)"></label>
          <label>Adres <input type="text" class="link-url" inputmode="url" autocomplete="off" placeholder="https://…"></label>
          <p class="error link-error" hidden></p>
          <div class="link-actions">
            <button type="button" class="link-remove" hidden>Link verwijderen</button>
            <button type="button" class="link-cancel">Annuleren</button>
            <button type="button" class="primary link-apply">Toepassen</button>
          </div>
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

  <dialog id="aboutDialog" class="about" aria-labelledby="aboutTitle">
    <form id="aboutForm" method="dialog">
      <h2 id="aboutTitle">Kabelkrant Notities</h2>
      <p class="about-version">Versie <strong id="aboutVersion">…</strong></p>
      <p id="aboutStatus" class="about-status" role="status" aria-live="polite">Controleren op updates…</p>
      <p id="aboutLatest" class="about-latest"></p>
      <p class="error" id="updateError" hidden></p>
      <div class="about-actions">
        <button type="button" id="updateBtn" class="primary about-btn" disabled>Updaten</button>
        <button type="button" id="aboutClose" class="about-btn">Sluiten</button>
      </div>
    </form>
  </dialog>

  <dialog id="wordartDialog" aria-labelledby="wordartTitle">
    <form id="wordartForm" method="dialog">
      <h2 id="wordartTitle">WordArt</h2>
      <div class="wordart-preview" id="wordartPreview" aria-hidden="true"></div>
      <label>Tekst
        <input type="text" name="text" maxlength="60" autocomplete="off" spellcheck="false" required>
      </label>
      <div class="field">
        <span class="field-label">Stijl</span>
        <div class="wordart-styles" id="wordartStyles"></div>
      </div>
      <div class="field">
        <span class="field-label">Vorm</span>
        <div class="wordart-shapes" id="wordartShapes"></div>
      </div>
      <p class="error" id="wordartError" hidden></p>
      <menu>
        <button type="button" id="wordartCancel">Annuleren</button>
        <button type="submit" class="primary">Opslaan</button>
      </menu>
    </form>
  </dialog>

  <dialog id="clockDialog" aria-labelledby="clockTitle">
    <form id="clockForm" method="dialog">
      <h2 id="clockTitle">Klok</h2>
      <div class="clock-preview"><div class="clock-art" id="clockPreview"></div></div>
      <div class="field">
        <span class="field-label">Stijl</span>
        <div class="clock-styles" id="clockStyles"></div>
      </div>
      <label>Tijdzone
        <input type="text" name="tz" list="clockTzList" placeholder="Leeg = lokale tijd van deze browser" autocomplete="off" spellcheck="false">
      </label>
      <datalist id="clockTzList"></datalist>
      <label>Label
        <input type="text" name="label" maxlength="40" placeholder="Bijvoorbeeld Studio" autocomplete="off">
      </label>
      <label class="inline-check"><input type="checkbox" name="seconds"> Secondewijzer tonen</label>
      <p class="error" id="clockError" hidden></p>
      <menu>
        <button type="button" id="clockCancel">Annuleren</button>
        <button type="submit" class="primary">Opslaan</button>
      </menu>
    </form>
  </dialog>

  <dialog id="countdownDialog" aria-labelledby="countdownTitle">
    <form id="countdownForm" method="dialog">
      <h2 id="countdownTitle">Afteller</h2>
      <div class="clock-preview"><div class="countdown-art" id="countdownPreview"></div></div>
      <div class="field">
        <span class="field-label">Ontwerp</span>
        <div class="countdown-styles" id="countdownStyles"></div>
      </div>
      <label>Label
        <input type="text" name="label" maxlength="40" placeholder="Bijvoorbeeld Afspraak tandarts" autocomplete="off">
      </label>
      <label>Einddatum en tijd
        <input type="datetime-local" name="when" required>
      </label>
      <label class="inline-check"><input type="checkbox" name="showDate"> Einddatum onderin weergeven</label>
      <p class="error" id="countdownError" hidden></p>
      <menu>
        <button type="button" id="countdownCancel">Annuleren</button>
        <button type="submit" class="primary">Opslaan</button>
      </menu>
    </form>
  </dialog>

  <dialog id="shapeDialog" aria-labelledby="shapeTitle">
    <form id="shapeForm" method="dialog">
      <h2 id="shapeTitle">Vorm</h2>
      <div class="shape-preview" id="shapePreview"></div>

      <div class="shape-view" id="shapeView1">
        <div class="field">
          <span class="field-label">Vorm</span>
          <div class="shape-kinds" id="shapeKinds"></div>
        </div>
        <div class="field">
          <span class="field-label">Kleurstelling</span>
          <div class="shape-presets" id="shapePresets"></div>
        </div>
        <label>Tekst
          <textarea name="text" rows="2" maxlength="300" placeholder="Tekst in de vorm (optioneel)"></textarea>
        </label>
        <p class="error" id="shapeError" hidden></p>
        <menu>
          <button type="button" id="shapeCancel">Annuleren</button>
          <button type="submit" class="primary">Opslaan</button>
        </menu>
      </div>

      <div class="shape-view" id="shapeView2" hidden>
        <fieldset class="shape-group">
          <legend>Rand</legend>
          <label class="inline-check"><input type="checkbox" name="strokeOn"> Rand tonen</label>
          <div class="shape-row"><label>Kleur<input type="color" name="strokeColor"></label>
            <label>Dikte <output id="strokeWOut"></output><input type="range" name="strokeW" min="1" max="24" step="1"></label></div>
        </fieldset>
        <fieldset class="shape-group">
          <legend>Vulling</legend>
          <label class="inline-check"><input type="checkbox" name="fillOn"> Vulling tonen</label>
          <div class="shape-row"><label>Kleur<input type="color" name="fillColor"></label>
            <label>Transparantie <output id="fillTranspOut"></output><input type="range" name="fillTransp" min="0" max="100" step="5"></label></div>
        </fieldset>
        <fieldset class="shape-group">
          <legend>Tekst</legend>
          <div class="shape-row"><label>Kleur<input type="color" name="textColor"></label>
            <label>Grootte <output id="textSizeOut"></output><input type="range" name="textSize" min="8" max="120" step="1"></label></div>
        </fieldset>
        <menu>
          <button type="button" id="shapeDesignCancel">Annuleren</button>
          <button type="button" id="shapeDesignOk" class="primary">OK</button>
        </menu>
      </div>
    </form>
  </dialog>

  <dialog id="resizeDialog" aria-labelledby="resizeTitle">
    <form method="dialog">
      <h2 id="resizeTitle">Afbeelding te groot</h2>
      <p id="resizeInfo"></p>
      <p>Wil je hem verkleinen?</p>
      <menu>
        <button type="submit" value="no">Nee, annuleren</button>
        <button type="submit" value="yes" class="primary" id="resizeYes">Ja, verkleinen</button>
      </menu>
    </form>
  </dialog>

  <div id="toast" class="toast" role="status" aria-live="polite" hidden>
    <span id="toastText"></span>
    <button type="button" id="toastAction">Ongedaan maken</button>
  </div>

<?php else: ?>
  <main id="board" class="board" aria-label="Notitiebord"></main>

  <dialog id="loginDialog" aria-labelledby="loginTitle">
    <form id="loginForm" method="dialog">
      <h2 id="loginTitle"><?= e($appName) ?></h2>
      <label>Wachtwoord <input type="password" name="password" autocomplete="current-password" required autofocus></label>
      <p class="error" id="loginError" hidden></p>
      <menu>
        <button type="submit" class="primary">Inloggen</button>
      </menu>
    </form>
  </dialog>

<?php endif; ?>
  <script type="importmap"><?= json_encode(['imports' => $imports], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
  <script id="boot" type="application/json"><?= json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
  <script src="assets/app.js?v=<?= $v('assets/app.js') ?>" type="module"></script>
</body>
</html>
