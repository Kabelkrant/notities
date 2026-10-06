<?php
declare(strict_types=1);

/** Bescherming tegen misbruik: snelheidslimiet per IP, Origin-controle en opslaglimieten. */
final class Guard
{
    /** Client-IP (IPv6 gegroepeerd op /64). X-Forwarded-For is bewust niet vertrouwd: die is te vervalsen. */
    public static function ip(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        if (str_contains($ip, ':') && ($bin = @inet_pton($ip)) !== false) {
            return bin2hex(substr($bin, 0, 8)) . '/64';
        }
        return $ip;
    }

    /** Geeft null als het mag, anders het aantal seconden dat de client moet wachten. */
    public static function rateLimit(string $bucket, int $max, int $window = 60): ?int
    {
        $dir = dirname(DATA_FILE) . '/ratelimit';
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            return null; // limiet nooit laten falen op een schrijfprobleem
        }
        $fh = @fopen($dir . '/' . sha1($bucket . '|' . self::ip()) . '.json', 'c+');
        if (!$fh) return null;
        try {
            flock($fh, LOCK_EX);
            $now = time();
            $hits = json_decode(stream_get_contents($fh) ?: '[]', true);
            $hits = array_values(array_filter(is_array($hits) ? $hits : [], fn($t) => is_int($t) && $t > $now - $window));
            if (count($hits) >= $max) {
                return max(1, $hits[0] + $window - $now);
            }
            $hits[] = $now;
            rewind($fh); ftruncate($fh, 0); fwrite($fh, json_encode($hits)); fflush($fh);
            return null;
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
            if (random_int(1, 100) === 1) self::cleanup($dir);
        }
    }

    private static function cleanup(string $dir): void
    {
        foreach (glob($dir . '/*.json') ?: [] as $f) {
            if (@filemtime($f) < time() - 3600) @unlink($f);
        }
    }

    /** Weigert verzoeken die een browser vanaf een andere website doet. */
    public static function sameOrigin(): bool
    {
        $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? null;
        if ($site !== null && !in_array($site, ['same-origin', 'none'], true)) return false;
        $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
        if ($origin !== null) {
            $p = parse_url($origin);
            $host = ($p['host'] ?? '') . (isset($p['port']) ? ':' . $p['port'] : '');
            if ($host === '' || strcasecmp($host, $_SERVER['HTTP_HOST'] ?? '') !== 0) return false;
        }
        return true;
    }

    public static function imageBytes(): int
    {
        $total = 0;
        foreach (glob(IMAGE_DIR . '/*') ?: [] as $f) $total += (int)@filesize($f);
        return $total;
    }
}
