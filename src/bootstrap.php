<?php
declare(strict_types=1);

require __DIR__ . '/../config.php';
require __DIR__ . '/../parsedown.php';
require __DIR__ . '/JsonStore.php';
require __DIR__ . '/NoteParsedown.php';
require __DIR__ . '/Guard.php';

// Limieten; overschrijfbaar in config.php (daar vóór het laden van deze file gedefinieerd).
foreach ([
    'MAX_ITEMS' => 500,                        // notities + afbeeldingen samen
    'MAX_IMAGES' => 200,
    'MAX_IMAGE_BYTES' => 15 * 1024 * 1024,     // per afbeelding
    'MAX_IMAGE_TOTAL_BYTES' => 500 * 1024 * 1024,
    'RATE_WRITES_PER_MIN' => 120,              // wijzigingen per IP per minuut (incl. verslepen)
    'RATE_UPLOADS_PER_MIN' => 6,               // uploads per IP per minuut
] as $k => $v) {
    defined($k) || define($k, $v);
}

function send_robots_header(): void {
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
}

const DEFAULT_COLOR = '#FFF59D';
const MAX_TITLE = 255;
const MAX_BODY = 20000;
const MIN_IMAGE_SIZE = 40;
const MAX_IMAGE_SIZE = 5000;
const IMAGE_FIT = 262; // beginformaat: past binnen IMAGE_FIT x IMAGE_FIT
const IMAGE_TYPES = [
    'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif',
    'image/webp' => 'webp', 'image/avif' => 'avif',
];

function start_session(): void {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    $token = $_SESSION['csrf'];
    session_write_close(); // geen sessielock tijdens polling
    $GLOBALS['csrf'] = $token;
}

function csrf_token(): string { return $GLOBALS['csrf']; }

function store(): JsonStore {
    static $s = null;
    return $s ??= new JsonStore(DATA_FILE);
}

function e(string $v): string {
    return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function valid_hex_color(mixed $c): bool {
    return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c) === 1;
}

function render_body(string $text): string {
    static $pd = null;
    if ($pd === null) {
        $pd = new NoteParsedown();
        $pd->setSafeMode(true);
        $pd->setBreaksEnabled(true);
        $pd->setUrlsLinked(true);
    }
    // 'www.' vooraf normaliseren zodat autolink werkt
    $text = preg_replace('~(?<=^|\s)(www\.[^\s<]+)~i', 'https://$1', $text);
    return $pd->text($text);
}

/** @param array<string,mixed> $r */
function note_to_array(array $r): array {
    $base = [
        'id' => (int)$r['id'],
        'type' => $r['type'] ?? 'note',
        'x' => (int)$r['x'],
        'y' => (int)$r['y'],
        'updated' => $r['updated'],
    ];
    if ($base['type'] === 'image') {
        return $base + ['file' => $r['file'], 'w' => (int)$r['w'], 'h' => (int)$r['h']];
    }
    return $base + [
        'title' => $r['title'],
        'body' => $r['body'],
        'html' => render_body($r['body']),
        'color' => $r['color'],
    ];
}

/** @return list<array<string,mixed>> */
function all_notes(): array {
    return array_map('note_to_array', store()->all());
}

function notes_version(array $notes): string {
    return md5(json_encode(array_map(
        fn($n) => [$n['id'], $n['type'], $n['title'] ?? '', $n['body'] ?? '', $n['color'] ?? '', $n['file'] ?? '', $n['w'] ?? 0, $n['h'] ?? 0, $n['x'], $n['y']],
        $notes
    )));
}
