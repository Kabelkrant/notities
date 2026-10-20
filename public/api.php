<?php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
start_session();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
send_robots_header();

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function too_many(int $retry): never {
    header('Retry-After: ' . $retry);
    respond(['error' => "Te veel verzoeken, probeer het over $retry seconden opnieuw"], 429);
}

function check_capacity(bool $isImage, int $newBytes = 0): void {
    $all = store()->all();
    if (count($all) >= MAX_ITEMS) {
        respond(['error' => 'Het bord zit vol (maximaal ' . MAX_ITEMS . ' items)'], 409);
    }
    if ($isImage) {
        $images = count(array_filter($all, fn($n) => ($n['type'] ?? 'note') === 'image'));
        if ($images >= MAX_IMAGES) {
            respond(['error' => 'Maximaal aantal afbeeldingen bereikt (' . MAX_IMAGES . ')'], 409);
        }
        if (Guard::imageBytes() + $newBytes > MAX_IMAGE_TOTAL_BYTES) {
            respond(['error' => 'De opslagruimte voor afbeeldingen is vol'], 409);
        }
    }
}

function require_feature(string $name, string $what): void {
    if (!feature_enabled($name)) respond(['error' => "Het toevoegen van $what is uitgeschakeld"], 403);
}

function clamp_int(mixed $v, int $min, int $max): int {
    return max($min, min($max, (int)$v));
}

/** Schaal (w,h) zodat het binnen IMAGE_FIT past, zonder op te blazen. */
function fit_size(int $w, int $h): array {
    $scale = min(1, IMAGE_FIT / max($w, $h, 1));
    return [max(MIN_IMAGE_SIZE, (int)round($w * $scale)), max(MIN_IMAGE_SIZE, (int)round($h * $scale))];
}

function handle_upload(): never {
    require_feature('PICTURES', 'afbeeldingen');
    $f = $_FILES['file'] ?? null;
    $max = round(MAX_IMAGE_BYTES / 1048576) . ' MB';
    if (!$f) {
        respond(['error' => "Geen bestand ontvangen (te groot? max $max)"], 413);
    }
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || $f['size'] > MAX_IMAGE_BYTES) {
        respond(['error' => "Afbeelding is te groot (max $max)"], 413);
    }
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        respond(['error' => 'Upload mislukt'], 400);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    $info = @getimagesize($f['tmp_name']);
    if (!isset(IMAGE_TYPES[$mime]) || !$info) {
        respond(['error' => 'Alleen PNG, JPEG, GIF, WebP of AVIF is toegestaan'], 415);
    }
    check_capacity(true, (int)$f['size']);
    if (!is_dir(IMAGE_DIR) && !mkdir(IMAGE_DIR, 0700, true)) {
        throw new RuntimeException('Afbeeldingenmap niet te maken');
    }
    $name = bin2hex(random_bytes(16)) . '.' . IMAGE_TYPES[$mime];
    if (!move_uploaded_file($f['tmp_name'], IMAGE_DIR . '/' . $name)) {
        throw new RuntimeException('Opslaan afbeelding mislukt');
    }
    // De browser kent EXIF-rotatie; die geeft het juiste formaat door. Anders: afmetingen uit het bestand.
    $w = (int)($_POST['w'] ?? 0); $h = (int)($_POST['h'] ?? 0);
    if ($w < 1 || $h < 1) { [$w, $h] = [$info[0], $info[1]]; }
    [$w, $h] = fit_size($w, $h);
    $note = store()->create([
        'type' => 'image', 'file' => $name,
        'w' => clamp_int($w, MIN_IMAGE_SIZE, MAX_IMAGE_SIZE), 'h' => clamp_int($h, MIN_IMAGE_SIZE, MAX_IMAGE_SIZE),
        'x' => clamp_int($_POST['x'] ?? 0, 0, 100000), 'y' => clamp_int($_POST['y'] ?? 0, 0, 100000),
    ]);
    respond(['note' => note_to_array($note)], 201);
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (!Auth::check()) respond(['error' => 'Niet ingelogd'], 401);
        if (isset($_GET['about'])) respond(Updater::about());
        $notes = all_notes();
        $version = notes_version($notes);
        if (($_GET['v'] ?? '') === $version) {
            respond(['changed' => false, 'version' => $version]);
        }
        respond(['changed' => true, 'version' => $version, 'notes' => $notes]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(['error' => 'Methode niet toegestaan'], 405);
    }

    if (!Guard::sameOrigin()) {
        respond(['error' => 'Verzoek van een andere website geweigerd'], 403);
    }
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals(csrf_token(), $token)) {
        respond(['error' => 'Ongeldige CSRF-token, herlaad de pagina'], 403);
    }
    if (($retry = Guard::rateLimit('write', RATE_WRITES_PER_MIN)) !== null) {
        too_many($retry);
    }

    if (str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data')) {
        if (!Auth::check()) respond(['error' => 'Niet ingelogd'], 401);
        if (($retry = Guard::rateLimit('upload', RATE_UPLOADS_PER_MIN)) !== null) {
            too_many($retry);
        }
        handle_upload();
    }

    $in = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($in)) {
        respond(['error' => 'Ongeldige invoer'], 400);
    }

    $action = $in['action'] ?? '';

    if ($action === 'login') {
        if (($retry = Guard::rateLimit('login', 6)) !== null) too_many($retry);
        if (!Auth::configured()) respond(['error' => 'Er is nog geen wachtwoord ingesteld (zie README)'], 503);
        if (!Auth::verify((string)($in['password'] ?? ''))) {
            usleep(500000); // remt gokken af
            respond(['error' => 'Onjuist wachtwoord'], 403);
        }
        Auth::login();
        respond(['ok' => true]);
    }
    if ($action === 'logout') {
        Auth::logout();
        respond(['ok' => true]);
    }
    if (!Auth::check()) respond(['error' => 'Niet ingelogd'], 401);

    $store = store();
    $id = (int)($in['id'] ?? 0);

    $fields = function () use ($in): array {
        $title = trim((string)($in['title'] ?? ''));
        $body = trim((string)($in['body'] ?? ''));
        if ($title === '' || $body === '') {
            respond(['error' => 'Titel en notitie zijn verplicht'], 422);
        }
        if (mb_strlen($title) > MAX_TITLE || mb_strlen($body) > MAX_BODY) {
            respond(['error' => 'Tekst is te lang'], 422);
        }
        $color = valid_hex_color($in['color'] ?? null) ? $in['color'] : DEFAULT_COLOR;
        return [$title, $body, $color];
    };
    $coord = fn(string $k): int => clamp_int($in[$k] ?? 0, 0, 100000);
    $found = fn(?array $n): array => $n ?? respond(['error' => 'Notitie niet gevonden'], 404);

    switch ($action) {
        case 'create':
            require_feature('NOTES', 'notities');
            [$t, $b, $c] = $fields();
            check_capacity(false);
            $n = $store->create(['type' => 'note', 'title' => $t, 'body' => $b, 'color' => $c, 'x' => $coord('x'), 'y' => $coord('y')]);
            respond(['note' => note_to_array($n)], 201);

        case 'create_arrow':
            require_feature('ARROW', 'pijlen');
            check_capacity(false);
            $n = $store->create([
                'type' => 'arrow', 'x' => $coord('x'), 'y' => $coord('y'),
                'w' => clamp_int($in['w'] ?? ARROW_DEFAULT_W, MIN_ARROW_LENGTH, MAX_IMAGE_SIZE),
                'h' => clamp_int($in['h'] ?? ARROW_DEFAULT_H, MIN_ARROW_THICKNESS, MAX_ARROW_THICKNESS),
                'rot' => 0, 'style' => 'solid', 'color' => ARROW_DEFAULT_COLOR,
            ]);
            respond(['note' => note_to_array($n)], 201);

        case 'arrow_update':
            if (($found($store->find($id))['type'] ?? '') !== 'arrow') respond(['error' => 'Alleen pijlen zijn hiermee aan te passen'], 400);
            $ch = [];
            foreach (['x', 'y'] as $k) if (isset($in[$k])) $ch[$k] = clamp_int($in[$k], 0, 100000);
            if (isset($in['w'])) $ch['w'] = clamp_int($in['w'], MIN_ARROW_LENGTH, MAX_IMAGE_SIZE);
            if (isset($in['h'])) $ch['h'] = clamp_int($in['h'], MIN_ARROW_THICKNESS, MAX_ARROW_THICKNESS);
            if (isset($in['rot'])) $ch['rot'] = (((int)round((float)$in['rot'])) % 360 + 360) % 360;
            if (isset($in['style'])) {
                if (!in_array($in['style'], ARROW_STYLES, true)) respond(['error' => 'Onbekend pijlontwerp'], 422);
                $ch['style'] = $in['style'];
            }
            if (isset($in['color'])) {
                if (!valid_hex_color($in['color'])) respond(['error' => 'Ongeldige kleur'], 422);
                $ch['color'] = $in['color'];
            }
            respond(['note' => note_to_array($found($store->update($id, $ch)))]);

        case 'create_clock':
            require_feature('CLOCK', 'klokken');
            check_capacity(false);
            $n = $store->create([
                'type' => 'clock', 'x' => $coord('x'), 'y' => $coord('y'),
                'w' => clamp_int($in['w'] ?? CLOCK_DEFAULT_SIZE, MIN_CLOCK_SIZE, MAX_CLOCK_SIZE),
                'style' => 'classic', 'tz' => '', 'label' => '', 'seconds' => true,
            ]);
            respond(['note' => note_to_array($n)], 201);

        case 'clock_update':
            if (($found($store->find($id))['type'] ?? '') !== 'clock') respond(['error' => 'Alleen klokken zijn hiermee aan te passen'], 400);
            $ch = [];
            foreach (['x', 'y'] as $k) if (isset($in[$k])) $ch[$k] = clamp_int($in[$k], 0, 100000);
            if (isset($in['w'])) $ch['w'] = clamp_int($in['w'], MIN_CLOCK_SIZE, MAX_CLOCK_SIZE);
            if (isset($in['style'])) {
                if (!in_array($in['style'], CLOCK_STYLES, true)) respond(['error' => 'Onbekende klokstijl'], 422);
                $ch['style'] = $in['style'];
            }
            if (isset($in['tz'])) {
                // IANA-naam (bijv. Europe/Amsterdam) of leeg = lokale tijd van de browser; de browser controleert de naam zelf
                $tz = trim((string)$in['tz']);
                if ($tz !== '' && (strlen($tz) > 64 || !preg_match('~^[A-Za-z0-9_+\-]+(/[A-Za-z0-9_+\-]+){0,2}$~', $tz))) respond(['error' => 'Ongeldige tijdzone'], 422);
                $ch['tz'] = $tz;
            }
            if (isset($in['label'])) {
                $ch['label'] = mb_substr(trim((string)preg_replace('/[\x00-\x1F\x7F]/u', '', (string)$in['label'])), 0, MAX_CLOCK_LABEL);
            }
            if (isset($in['seconds'])) $ch['seconds'] = (bool)$in['seconds'];
            respond(['note' => note_to_array($found($store->update($id, $ch)))]);

        case 'update':
            [$t, $b, $c] = $fields();
            if (($found($store->find($id))['type'] ?? 'note') !== 'note') respond(['error' => 'Alleen notities zijn te bewerken'], 400);
            // Conflictcontrole: de client geeft de inhoud mee waarop zijn bewerking gebaseerd is (verplaatsen telt niet mee).
            $expect = null;
            if (empty($in['force']) && is_array($in['base'] ?? null)) {
                $expect = [];
                foreach (['title', 'body', 'color'] as $k) $expect[$k] = (string)($in['base'][$k] ?? '');
            }
            try {
                $n = $store->update($id, ['title' => $t, 'body' => $b, 'color' => $c], $expect);
            } catch (ConflictException) {
                respond(['error' => 'Deze notitie is ondertussen door iemand anders gewijzigd. Klik nogmaals op Opslaan om die wijziging te overschrijven, of annuleer om eerst de nieuwe versie te zien.'], 409);
            }
            respond(['note' => note_to_array($found($n))]);

        case 'move':
            $found($store->update($id, ['x' => $coord('x'), 'y' => $coord('y')]));
            respond(['ok' => true]);

        case 'resize':
            if (($found($store->find($id))['type'] ?? 'note') !== 'image') respond(['error' => 'Alleen afbeeldingen zijn te schalen'], 400);
            $found($store->update($id, [
                'w' => clamp_int($in['w'] ?? 0, MIN_IMAGE_SIZE, MAX_IMAGE_SIZE),
                'h' => clamp_int($in['h'] ?? 0, MIN_IMAGE_SIZE, MAX_IMAGE_SIZE),
            ]));
            respond(['ok' => true]);

        case 'self_update':
            if (($retry = Guard::rateLimit('update', 5)) !== null) too_many($retry);
            if (($why = Updater::blocked()) !== null) respond(['error' => $why], 409);
            try {
                $v = Updater::install();
            } catch (RuntimeException $ex) {
                error_log('Update mislukt: ' . $ex->getMessage());
                respond(['error' => 'Bijwerken mislukt: ' . $ex->getMessage()], 500);
            }
            respond(['ok' => true, 'version' => $v]);

        case 'delete':
            $removed = $store->delete($id);
            if (($removed['type'] ?? 'note') === 'image' && preg_match('/^[a-f0-9]{32}\.\w+$/', $removed['file'] ?? '')) {
                @unlink(IMAGE_DIR . '/' . $removed['file']);
            }
            respond(['ok' => true]);

        default:
            respond(['error' => 'Onbekende actie'], 400);
    }
} catch (Throwable $ex) {
    error_log($ex->getMessage());
    respond(['error' => 'Serverfout'], 500);
}
