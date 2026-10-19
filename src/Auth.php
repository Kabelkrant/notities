<?php
declare(strict_types=1);

/**
 * Wachtwoordbeveiliging voor de hele app (alleen wachtwoord, geen gebruikersnaam).
 *
 * - Het wachtwoord staat leesbaar in .env (APP_PASSWORD); wijzigen kan door APP_PASSWORD in die file aan te passen
 * - Na inloggen krijgt de browser 30 dagen een ondertekende cookie: "<verloopmoment>.<HMAC>". Er is geen opslag op
 *   de server; de sleutel is afgeleid van het wachtwoord, dus een nieuw wachtwoord logt iedereen meteen uit.
 * - Is er geen wachtwoord ingesteld, dan blijft alles dicht (fail closed).
 */
final class Auth
{
    public const COOKIE = 'kn_auth';
    public const LIFETIME = 30 * 24 * 3600;

    /** @var array<string,string>|null */
    private static ?array $env = null;

    public static function env(string $key): ?string
    {
        if (self::$env === null) {
            self::$env = [];
            foreach (@file(dirname(__DIR__) . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
                [$k, $v] = array_map('trim', explode('=', $line, 2));
                if (strlen($v) >= 2 && ($v[0] === "'" || $v[0] === '"') && str_ends_with($v, $v[0])) $v = substr($v, 1, -1);
                self::$env[$k] = $v;
            }
        }
        return self::$env[$key] ?? null;
    }

    private static function password(): ?string
    {
        $p = self::env('APP_PASSWORD');
        return $p !== null && $p !== '' ? $p : null;
    }

    public static function configured(): bool { return self::password() !== null; }

    /** Naam van de app (inlogscherm en tabbladtitel), instelbaar met APP_NAME in .env. */
    public static function appName(): string
    {
        $n = self::env('APP_NAME');
        return $n !== null && $n !== '' ? $n : 'Kabelkrant Notities';
    }

    public static function verify(string $password): bool
    {
        $p = self::password();
        // hash_equals op vaste lengte (sha256) zodat lengte en inhoud niet via timing lekken
        return $p !== null && hash_equals(hash('sha256', $p), hash('sha256', $password));
    }

    private static function sign(int $exp): string
    {
        return hash_hmac('sha256', (string)$exp, hash('sha256', (string)self::password() . '|kabelkrant-auth'));
    }

    /** Is deze browser ingelogd? */
    public static function check(): bool
    {
        if (!self::configured()) return false;
        $c = $_COOKIE[self::COOKIE] ?? '';
        if (!is_string($c) || !preg_match('/^(\d{1,12})\.([0-9a-f]{64})$/', $c, $m)) return false;
        return (int)$m[1] > time() && hash_equals(self::sign((int)$m[1]), $m[2]);
    }

    public static function login(): void
    {
        $exp = time() + self::LIFETIME;
        self::setCookie($exp . '.' . self::sign($exp), $exp);
    }

    public static function logout(): void
    {
        self::setCookie('', time() - 3600);
        unset($_COOKIE[self::COOKIE]);
    }

    private static function setCookie(string $value, int $expires): void
    {
        setcookie(self::COOKIE, $value, [
            'expires' => $expires,
            'path' => '/',
            'secure' => !empty($_SERVER['HTTPS']),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
}
