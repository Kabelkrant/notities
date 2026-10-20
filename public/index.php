<?php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
start_session();
send_robots_header();
header('Cache-Control: private, no-store');

$authed = Auth::check();
$appName = Auth::appName();
$notes = $authed ? all_notes() : [];
// Zoomniveau uit de cookie 'zoom' (door app geschreven); server zet het meteen, zodat de pagina niet eerst op 100% laadt.
$zoom = isset($_COOKIE['zoom']) && is_numeric($_COOKIE['zoom']) ? max(0.25, min(3.0, (float)$_COOKIE['zoom'])) : 1.0;
$snap = ($_COOKIE['snap'] ?? '') === '1';
// Drempels voor 'afbeelding te groot' (vraag om te verkleinen), uit .env; ongeldige waarden vallen terug op de standaard
$envInt = fn(string $k, int $default, int $min, int $max): int => max($min, min($max, (int)(Auth::env($k) ?: $default)));
$allow = [ // welke soorten items er nog toegevoegd mogen worden (.env: ALLOW_NOTES, ALLOW_PICTURES, ALLOW_ARROW, ALLOW_CLOCK)
    'notes' => feature_enabled('NOTES'), 'pictures' => feature_enabled('PICTURES'),
    'arrow' => feature_enabled('ARROW'), 'clock' => feature_enabled('CLOCK'),
];
$boot = [
    'allow' => $allow,
    'imageMaxDim' => $envInt('IMAGE_MAX_DIMENSION', 2000, 100, 5000),
    'imageMaxBytes' => $envInt('IMAGE_MAX_KB', 2048, 50, 15 * 1024) * 1024,
    'auth' => $authed,
    'snap' => $snap,
    'zoom' => $zoom,
    'csrf' => csrf_token(),
    'version' => notes_version($notes),
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
<body>
  <h1 class="sr-only"><?= e($appName) ?></h1>
<?php if ($authed): ?>
  <div class="toolbar">
    <span id="status" class="status" role="status" aria-live="polite"></span>
    <div class="split"<?= in_array(true, $allow, true) ? '' : ' hidden' ?>>
      <button id="newBtn" type="button" class="icon-btn add-btn" title="Nieuw" aria-label="Nieuw" aria-haspopup="menu" aria-expanded="false" aria-controls="newMenu">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <div id="newMenu" class="menu" data-align="center" role="menu" hidden>
        <button type="button" role="menuitem" id="newNote"<?= $allow['notes'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">🗒️</span> Notitie</button>
        <button type="button" role="menuitem" id="newImage"<?= $allow['pictures'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">🖼️</span> Afbeelding</button>
        <button type="button" role="menuitem" id="newArrow"<?= $allow['arrow'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">➡️</span> Pijl</button>
        <button type="button" role="menuitem" id="newClock"<?= $allow['clock'] ? '' : ' hidden' ?>><span class="ico" aria-hidden="true">🕐</span> Klok</button>
      </div>
    </div>
    <div class="zoom-ctl" role="group" aria-label="Zoomen">
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
        <button type="button" role="menuitem" id="resetZoom"><span class="ico" aria-hidden="true">🔎</span> Reset zoom</button>
        <button type="button" role="menuitemcheckbox" id="snapToggle" aria-checked="<?= $snap ? 'true' : 'false' ?>"><span class="ico" aria-hidden="true"><span class="check">✓</span></span>Snap to grid</button>
        <button type="button" role="menuitem" id="logoutBtn"><span class="ico" aria-hidden="true">🔒</span> Uitloggen</button>
        <button type="button" role="menuitem" id="aboutBtn"><span class="ico" aria-hidden="true">ℹ️</span> Over</button>
      </div>
    </div>
    <input type="file" id="imageInput" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" hidden>
  </div>

  <main id="board" class="board<?= $snap ? ' snap' : '' ?>" aria-label="Notitiebord" style="--zoom: <?= $zoom ?>"></main>

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
          <button type="button" data-fmt="emoji" id="emojiBtn" title="Emoji" aria-label="Emoji" aria-haspopup="true" aria-expanded="false">😀</button>
        </div>
        <div class="emoji-pop" id="emojiPop" role="group" aria-label="Emoji" hidden></div>
        <div class="link-box" id="linkBox" hidden>
          <label>Tekst <input type="text" id="linkText" autocomplete="off" placeholder="Zichtbare tekst (leeg = het adres zelf)"></label>
          <label>Adres <input type="text" id="linkUrl" inputmode="url" autocomplete="off" placeholder="https://…"></label>
          <p class="error" id="linkError" hidden></p>
          <div class="link-actions">
            <button type="button" id="linkRemove" hidden>Link verwijderen</button>
            <button type="button" id="linkCancel">Annuleren</button>
            <button type="button" id="linkApply" class="primary">Toepassen</button>
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

  <dialog id="arrowDialog" aria-labelledby="arrowTitle">
    <form id="arrowForm" method="dialog">
      <h2 id="arrowTitle">Pijl</h2>
      <div class="arrow-preview" id="arrowPreview"></div>
      <div class="field">
        <span class="field-label">Ontwerp</span>
        <div class="arrow-styles" id="arrowStyles"></div>
      </div>
      <label>Kleur
        <span class="swatches" id="arrowSwatches"></span>
        <input type="color" name="color" value="#e53935">
      </label>
      <menu>
        <button type="button" id="arrowCancel">Annuleren</button>
        <button type="submit" class="primary">Opslaan</button>
      </menu>
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
