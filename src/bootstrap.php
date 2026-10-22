<?php
declare(strict_types=1);

require __DIR__ . '/../config.php';
require __DIR__ . '/../parsedown.php';
require __DIR__ . '/Backup.php';
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
const MAX_FOLDERS = 200;
const MAX_FOLDER_NAME = 60;
const MAX_BODY = 20000;
const MIN_IMAGE_SIZE = 40;
const MAX_IMAGE_SIZE = 5000;
const SHAPE_KINDS = ['rect', 'circle', 'arrow', 'heart']; // rechthoek (afgerond), cirkel/ellips, pijl, hartje
const SHAPE_DEFAULT_W = 200;
const SHAPE_DEFAULT_H = 120;
const MIN_SHAPE_SIZE = 30;
const MAX_SHAPE_SIZE = 5000;
const MAX_SHAPE_TEXT = 300;
const MIN_SHAPE_TEXT_SIZE = 8;
const MAX_SHAPE_TEXT_SIZE = 200;
const MAX_SHAPE_STROKE = 40;
const SHAPE_DEFAULTS = [ // standaard 'Petrol': vulling, rand en tekstkleur
    'kind' => 'rect', 'text' => '', 'textColor' => '#FFFFFF', 'textSize' => 20,
    'strokeOn' => true, 'strokeColor' => '#0E4A62', 'strokeW' => 3,
    'fillOn' => true, 'fillColor' => '#166786', 'fillTransp' => 0,
];
const CLOCK_STYLES = ['classic', 'red', 'neon', 'black', 'digital']; // zilver, rood, neon, zwarte rand, digitaal
const CLOCK_DEFAULT_SIZE = 160;
const MIN_CLOCK_SIZE = 80;
const MAX_CLOCK_SIZE = 600;
const MAX_CLOCK_LABEL = 40;
const COUNTDOWN_STYLES = ['classic', 'digital', 'flip', 'color', 'chalk']; // klassiek, digitaal, omklapkaartjes, kleurrijk, krijtbord
const COUNTDOWN_DEFAULT_SIZE = 200;
const MIN_COUNTDOWN_SIZE = 120;
const MAX_COUNTDOWN_SIZE = 600;
const MAX_COUNTDOWN_LABEL = 40;
const MAX_COUNTDOWN_AHEAD = 100 * 365 * 86400; // streefdatum hooguit 100 jaar vooruit
const ITEM_TYPES = ['note', 'image', 'shape', 'clock', 'wordart', 'countdown']; // onbekende types (bijv. na een terugdraaiing) worden niet getoond
const WORDART_STYLES = ['rainbow', 'chrome', 'gold', 'neon', 'fire', 'retro', 'comic', 'jungle'];
const WORDART_SHAPES = ['straight', 'arch_up', 'arch_down', 'wave'];
const WORDART_DEFAULT_TEXT = 'WordArt';
const WORDART_DEFAULT_W = 260;
const MIN_WORDART_WIDTH = 60;
const MAX_WORDART_WIDTH = 3000;
const MIN_WORDART_HEIGHT = 20;
const MAX_WORDART_HEIGHT = 3000;
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
            'w' => (int)$r['w'], 'h' => (int)($r['h'] ?? 0), 'rot' => (int)($r['rot'] ?? 0), 'text' => $r['text'] ?? WORDART_DEFAULT_TEXT,
            'style' => $r['style'] ?? 'rainbow', 'shape' => $r['shape'] ?? 'straight',
        ];
    }
    if ($base['type'] === 'countdown') {
        return $base + [
            'w' => (int)$r['w'], 'h' => (int)$r['w'], 'style' => $r['style'] ?? 'classic',
            'label' => $r['label'] ?? '', 'target' => (int)($r['target'] ?? 0), 'showDate' => (bool)($r['showDate'] ?? true),
        ];
    }
    if ($base['type'] === 'clock') {
        return $base + [
            'w' => (int)$r['w'], 'h' => (int)$r['w'], 'style' => $r['style'] ?? 'classic',
            'tz' => $r['tz'] ?? '', 'label' => $r['label'] ?? '', 'seconds' => (bool)($r['seconds'] ?? true),
        ];
    }
    if ($base['type'] === 'shape') {
        $d = SHAPE_DEFAULTS;
        return $base + [
            'w' => (int)$r['w'], 'h' => (int)$r['h'], 'rot' => (int)($r['rot'] ?? 0),
            'kind' => $r['kind'] ?? $d['kind'], 'text' => (string)($r['text'] ?? ''),
            'textColor' => $r['textColor'] ?? $d['textColor'], 'textSize' => (int)($r['textSize'] ?? $d['textSize']),
            'strokeOn' => (bool)($r['strokeOn'] ?? $d['strokeOn']), 'strokeColor' => $r['strokeColor'] ?? $d['strokeColor'], 'strokeW' => (int)($r['strokeW'] ?? $d['strokeW']),
            'fillOn' => (bool)($r['fillOn'] ?? $d['fillOn']), 'fillColor' => $r['fillColor'] ?? $d['fillColor'], 'fillTransp' => (int)($r['fillTransp'] ?? $d['fillTransp']),
        ];
    }
    return $base + [
        'title' => $r['title'],
        'body' => $r['body'],
        'html' => render_body($r['body']),
        'color' => $r['color'],
        'order' => (int)($r['order'] ?? -$r['id']), // volgorde in de notitie-app (standaard nieuwste eerst); los van positie en stapelvolgorde op het canvas
        'folder' => (int)($r['folder'] ?? 0),       // map in de notitie-app; 0 = (niet ingedeeld), -1 = Prullenbak
    ];
}

/** @return list<array<string,mixed>> */
function all_notes(): array {
    $rows = array_map(fn($r) => ($r['type'] ?? '') === 'arrow' ? shape_from_arrow($r) : $r, store()->all());
    $known = array_filter($rows, fn($r) => in_array($r['type'] ?? 'note', ITEM_TYPES, true));
    return array_map('note_to_array', array_values($known));
}

/** De oude Pijl-widget bestaat niet meer: een bestaande pijl wordt een vorm 'pijl' met dezelfde afmetingen, rotatie en kleur. */
function shape_from_arrow(array $r): array {
    $color = valid_hex_color($r['color'] ?? null) ? $r['color'] : '#E53935';
    $outline = ($r['style'] ?? 'solid') === 'outline';
    return ['type' => 'shape', 'kind' => 'arrow', 'text' => '', 'textColor' => '#FFFFFF', 'textSize' => 20,
        'strokeOn' => $outline, 'strokeColor' => $color, 'strokeW' => 3,
        'fillOn' => true, 'fillColor' => $color, 'fillTransp' => $outline ? 86 : 0] + array_diff_key($r, ['color' => 1, 'style' => 1]);
}

function all_folders(): array {
    return store()->folders();
}

function notes_version(array $notes, array $folders = []): string {
    return md5(json_encode([$folders, array_map(
        fn($n) => [$n['id'], $n['type'], $n['title'] ?? '', $n['body'] ?? '', $n['color'] ?? '', $n['file'] ?? '', $n['w'] ?? 0, $n['h'] ?? 0, $n['x'], $n['y'], $n['rot'] ?? 0, $n['style'] ?? '', $n['tz'] ?? '', $n['label'] ?? '', $n['seconds'] ?? null, $n['text'] ?? '', $n['shape'] ?? '', $n['target'] ?? 0, $n['showDate'] ?? null, $n['type'] === 'shape' ? $n : null, $n['order'] ?? null, $n['folder'] ?? null],
        $notes
    )]));
}
