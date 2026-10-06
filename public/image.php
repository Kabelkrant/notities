<?php
declare(strict_types=1);
require __DIR__ . '/../config.php';

$f = $_GET['f'] ?? '';
if (!preg_match('/^[a-f0-9]{32}\.(png|jpg|gif|webp|avif)$/', $f, $m)) {
    http_response_code(404);
    exit;
}
$path = IMAGE_DIR . '/' . $f;
if (!is_file($path)) {
    http_response_code(404);
    exit;
}
$types = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'avif' => 'image/avif'];
header('Content-Type: ' . $types[$m[1]]);
header('Content-Length: ' . filesize($path));
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Content-Security-Policy: default-src \'none\'');
header('Cache-Control: public, max-age=31536000, immutable'); // bestandsnaam is willekeurig en uniek
readfile($path);
