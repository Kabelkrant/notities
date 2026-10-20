<?php
declare(strict_types=1);

require __DIR__ . '/../config.php';
require __DIR__ . '/../parsedown.php';
require __DIR__ . '/JsonStore.php';
require __DIR__ . '/NoteParsedown.php';
require __DIR__ . '/Guard.php';
require __DIR__ . '/Updater.php';
require __DIR__ . '/Auth.php';

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
const ARROW_STYLES = ['solid', 'outline', 'line', 'dashed', 'double']; // blokpijl, omlijnd, lijn, gestreept, dubbel
const ARROW_DEFAULT_COLOR = '#E53935';
const ARROW_DEFAULT_W = 180;
const ARROW_DEFAULT_H = 48;
const MIN_ARROW_LENGTH = 40;
const MIN_ARROW_THICKNESS = 16;
const MAX_ARROW_THICKNESS = 400;
const CLOCK_STYLES = ['classic', 'red', 'neon', 'black', 'digital']; // zilver, rood, neon, zwarte rand, digitaal
const CLOCK_DEFAULT_SIZE = 160;
const MIN_CLOCK_SIZE = 80;
const MAX_CLOCK_SIZE = 600;
const MAX_CLOCK_LABEL = 40;
const WORDART_STYLES = ['rainbow', 'chrome', 'gold', 'neon', 'fire', 'retro', 'comic'];
const WORDART_SHAPES = ['straight', 'arch_up', 'arch_down', 'wave'];
const WORDART_DEFAULT_TEXT = 'WordArt';
const WORDART_DEFAULT_W = 260;
const MIN_WORDART_WIDTH = 60;
const MAX_WORDART_WIDTH = 3000;
const MAX_WORDART_TEXT = 60;
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

/**
 * Mag dit soort onderdeel nog worden toegevoegd? ALLOW_<NAAM> in .env (1/0, true/false, yes/no, on/off).
 * Ontbreekt de regel of is de waarde onbegrijpelijk, dan geldt de standaard: alleen notities staan standaard aan.
 * Raakt bestaande items niet.
 */
function feature_enabled(string $name): bool {
    $default = $name === 'NOTES';
    $v = Auth::env('ALLOW_' . $name);
    if ($v === null || trim($v) === '') return $default; // filter_var leest een lege waarde als 'false', dus eerst apart afvangen
    return filter_var($v, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
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
    if ($base['type'] === 'wordart') {
        return $base + [
            'w' => (int)$r['w'], 'rot' => (int)($r['rot'] ?? 0), 'text' => $r['text'] ?? WORDART_DEFAULT_TEXT,
            'style' => $r['style'] ?? 'rainbow', 'shape' => $r['shape'] ?? 'straight',
        ];
    }
    if ($base['type'] === 'clock') {
        return $base + [
            'w' => (int)$r['w'], 'h' => (int)$r['w'], 'style' => $r['style'] ?? 'classic',
            'tz' => $r['tz'] ?? '', 'label' => $r['label'] ?? '', 'seconds' => (bool)($r['seconds'] ?? true),
        ];
    }
    if ($base['type'] === 'arrow') {
        return $base + [
            'w' => (int)$r['w'], 'h' => (int)$r['h'], 'rot' => (int)($r['rot'] ?? 0),
            'style' => $r['style'] ?? 'solid', 'color' => $r['color'] ?? ARROW_DEFAULT_COLOR,
        ];
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
        fn($n) => [$n['id'], $n['type'], $n['title'] ?? '', $n['body'] ?? '', $n['color'] ?? '', $n['file'] ?? '', $n['w'] ?? 0, $n['h'] ?? 0, $n['x'], $n['y'], $n['rot'] ?? 0, $n['style'] ?? '', $n['tz'] ?? '', $n['label'] ?? '', $n['seconds'] ?? null, $n['text'] ?? '', $n['shape'] ?? ''],
        $notes
    )));
}
