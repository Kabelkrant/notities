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

function clamp_int(mixed $v, int $min, int $max): int {
    return max($min, min($max, (int)$v));
}

/** Schaal (w,h) zodat het binnen IMAGE_FIT past, zonder op te blazen. */
function fit_size(int $w, int $h): array {
    $scale = min(1, IMAGE_FIT / max($w, $h, 1));
    return [max(MIN_IMAGE_SIZE, (int)round($w * $scale)), max(MIN_IMAGE_SIZE, (int)round($h * $scale))];
}

function handle_upload(): never {
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
        if (($retry = Guard::rateLimit('upload', RATE_UPLOADS_PER_MIN)) !== null) {
            too_many($retry);
        }
        handle_upload();
    }

    $in = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($in)) {
        respond(['error' => 'Ongeldige invoer'], 400);
    }

    $store = store();
    $action = $in['action'] ?? '';
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
    $isType = fn(string $type) => ($store->find($id)['type'] ?? 'note') === $type;

    switch ($action) {
        case 'create':
            [$t, $b, $c] = $fields();
            check_capacity(false);
            $n = $store->create(['type' => 'note', 'title' => $t, 'body' => $b, 'color' => $c, 'x' => $coord('x'), 'y' => $coord('y')]);
            respond(['note' => note_to_array($n)], 201);

        case 'update':
            [$t, $b, $c] = $fields();
            if (!$isType('note')) respond(['error' => 'Alleen notities zijn te bewerken'], 400);
            respond(['note' => note_to_array($found($store->update($id, ['title' => $t, 'body' => $b, 'color' => $c])))]);

        case 'move':
            $store->update($id, ['x' => $coord('x'), 'y' => $coord('y')]);
            respond(['ok' => true]);

        case 'resize':
            if (!$isType('image')) respond(['error' => 'Alleen afbeeldingen zijn te schalen'], 400);
            $store->update($id, [
                'w' => clamp_int($in['w'] ?? 0, MIN_IMAGE_SIZE, MAX_IMAGE_SIZE),
                'h' => clamp_int($in['h'] ?? 0, MIN_IMAGE_SIZE, MAX_IMAGE_SIZE),
            ]);
            respond(['ok' => true]);

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
