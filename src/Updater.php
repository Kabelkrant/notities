<?php
declare(strict_types=1);

/**
 * Versie-informatie en zelf-update vanaf GitHub.
 *
 * - Lokale versie: bij een git-checkout uit .git, anders uit het bestand VERSION (door de updater geschreven).
 * - Controle: laatste commit van de hoofdbranch via de GitHub API (10 minuten gecachet in data/).
 * - Installeren: zipball van exact die commit downloaden, uitpakken en bestand voor bestand over de installatie kopiëren.
 *   data/, config.php, .env en .git* blijven ongemoeid. Overschreven bestanden gaan eerst naar data/backup-<tijd>/.
 * - Een git-checkout wordt nooit overschreven (dan: git pull).
 */
final class Updater
{
    public const NAME = 'Kabelkrant Notities';
    public const REPO = 'Kabelkrant/notities';
    public const BRANCH = 'main';
    private const UA = 'KabelkrantNotities-Updater';
    private const MAX_ZIP_BYTES = 20 * 1024 * 1024;
    private const CACHE_OK = 600;
    private const CACHE_ERROR = 60;
    /** Bovenste niveau-namen die nooit worden overschreven. */
    private const KEEP = ['data', 'config.php', '.env', 'VERSION', '.git', '.github'];

    private static function root(): string { return dirname(__DIR__); }
    private static function dataDir(): string { return dirname(DATA_FILE); }
    public static function isGitCheckout(): bool { return file_exists(self::root() . '/.git'); }

    /** @return array{sha:?string,date:?string,source:?string} */
    public static function localVersion(): array
    {
        if (self::isGitCheckout()) {
            return ['sha' => self::gitHead(), 'date' => null, 'source' => 'git'];
        }
        $v = json_decode((string)@file_get_contents(self::root() . '/VERSION'), true);
        if (is_array($v) && preg_match('/^[0-9a-f]{40}$/', (string)($v['sha'] ?? ''))) {
            return ['sha' => $v['sha'], 'date' => $v['date'] ?? null, 'source' => 'bestand'];
        }
        return ['sha' => null, 'date' => null, 'source' => null];
    }

    private static function gitHead(): ?string
    {
        $git = self::root() . '/.git';
        $head = trim((string)@file_get_contents($git . '/HEAD'));
        if (str_starts_with($head, 'ref: ')) {
            $ref = substr($head, 5);
            $sha = trim((string)@file_get_contents($git . '/' . $ref));
            if ($sha === '') {
                foreach (file($git . '/packed-refs', FILE_IGNORE_NEW_LINES) ?: [] as $line) {
                    if (str_ends_with($line, ' ' . $ref)) { $sha = substr($line, 0, 40); break; }
                }
            }
            $head = $sha;
        }
        return preg_match('/^[0-9a-f]{40}$/', $head) ? $head : null;
    }

    /** Waarom updaten niet kan (null = kan wel). */
    public static function blocked(): ?string
    {
        if (self::isGitCheckout()) {
            return 'Dit is een git-checkout; werk bij met git pull.';
        }
        if (!class_exists('ZipArchive') || !function_exists('curl_init')) {
            return 'De PHP-extensies zip en curl zijn nodig om te updaten.';
        }
        return null;
    }

    /** @return array<string,mixed> */
    public static function about(): array
    {
        $local = self::localVersion();
        return [
            'name' => self::NAME,
            'version' => $local + ['short' => $local['sha'] ? substr($local['sha'], 0, 7) : null],
            'repo' => 'https://github.com/' . self::REPO,
            'blocked' => self::blocked(),
            'check' => self::check($local['sha']),
        ];
    }

    /** @return array<string,mixed> state: current | update | newer | unknown | error */
    public static function check(?string $localSha): array
    {
        $cacheFile = self::dataDir() . '/update-check.json';
        $c = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($c) && ($c['local'] ?? null) === $localSha && time() - (int)($c['at'] ?? 0) < (int)($c['ttl'] ?? 0)) {
            return $c['result'];
        }
        try {
            $latest = self::latestCommit();
            $result = ['latest' => $latest];
            if ($localSha === $latest['sha']) {
                $result['state'] = 'current';
            } elseif ($localSha === null) {
                $result['state'] = 'unknown';
            } else {
                try {
                    $cmp = self::github('/compare/' . $localSha . '...' . $latest['sha']);
                    $result['state'] = match ($cmp['status'] ?? '') {
                        'identical' => 'current',
                        'behind' => 'newer',      // lokaal loopt voor op GitHub
                        default => 'update',      // ahead / diverged
                    };
                } catch (RuntimeException) {
                    $result['state'] = 'unknown'; // lokale commit kent GitHub niet
                }
            }
            $ttl = self::CACHE_OK;
        } catch (RuntimeException $e) {
            $result = ['state' => 'error', 'message' => $e->getMessage()];
            $ttl = self::CACHE_ERROR;
        }
        @file_put_contents($cacheFile, json_encode(['at' => time(), 'ttl' => $ttl, 'local' => $localSha, 'result' => $result]), LOCK_EX);
        return $result;
    }

    /** @return array{sha:string,short:string,message:string,date:?string} */
    private static function latestCommit(): array
    {
        $c = self::github('/commits/' . self::BRANCH);
        if (!preg_match('/^[0-9a-f]{40}$/', (string)($c['sha'] ?? ''))) {
            throw new RuntimeException('Onverwacht antwoord van GitHub');
        }
        return [
            'sha' => $c['sha'],
            'short' => substr($c['sha'], 0, 7),
            'message' => strtok((string)($c['commit']['message'] ?? ''), "\n") ?: '',
            'date' => $c['commit']['committer']['date'] ?? null,
        ];
    }

    /** @return array<string,mixed> */
    private static function github(string $path): array
    {
        $ch = self::curl('https://api.github.com/repos/' . self::REPO . $path, ['Accept: application/vnd.github+json'], 8);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) throw new RuntimeException('GitHub niet bereikbaar' . ($err ? " ($err)" : ''));
        $data = json_decode((string)$body, true);
        if ($code !== 200 || !is_array($data)) {
            throw new RuntimeException($code === 403 ? 'GitHub-limiet bereikt, probeer het later opnieuw' : "GitHub gaf status $code");
        }
        return $data;
    }

    /** @param list<string> $headers */
    private static function curl(string $url, array $headers, int $timeout): CurlHandle
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => self::UA,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        return $ch;
    }

    /** @return array{sha:string,short:string} */
    public static function install(): array
    {
        if (($why = self::blocked()) !== null) throw new RuntimeException($why);
        ignore_user_abort(true); // een afgebroken verzoek mag een update niet halverwege laten steken
        set_time_limit(180);

        $dd = self::dataDir();
        if (!is_dir($dd) && !mkdir($dd, 0700, true)) throw new RuntimeException('Datamap niet te maken');
        $lock = fopen($dd . '/update.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) throw new RuntimeException('Er loopt al een update');
        $work = $dd . '/update-' . bin2hex(random_bytes(4));
        try {
            $latest = self::latestCommit();
            if (!mkdir($work, 0700)) throw new RuntimeException('Werkmap niet te maken');
            $zipPath = $work . '/src.zip';
            self::download('https://api.github.com/repos/' . self::REPO . '/zipball/' . $latest['sha'], $zipPath);
            $extracted = self::extract($zipPath, $work . '/x');
            $files = self::plan($extracted);
            self::apply($extracted, $files, $dd . '/backup-' . date('Ymd-His'));
            file_put_contents(self::root() . '/VERSION', json_encode(
                ['sha' => $latest['sha'], 'date' => $latest['date'], 'updated' => date('c')], JSON_PRETTY_PRINT
            ));
            @unlink($dd . '/update-check.json');
            if (function_exists('opcache_reset')) @opcache_reset();
            return ['sha' => $latest['sha'], 'short' => $latest['short']];
        } finally {
            self::rrmdir($work);
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    private static function download(string $url, string $dest): void
    {
        $fh = fopen($dest, 'wb');
        if (!$fh) throw new RuntimeException('Downloadbestand niet te maken');
        $bytes = 0;
        $ch = self::curl($url, ['Accept: application/vnd.github+json'], 120);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
        curl_setopt($ch, CURLOPT_FAILONERROR, true);
        curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($ch, string $chunk) use ($fh, &$bytes): int {
            $bytes += strlen($chunk);
            return $bytes > self::MAX_ZIP_BYTES ? 0 : (int)fwrite($fh, $chunk);
        });
        $ok = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        fclose($fh);
        if ($ok === false) throw new RuntimeException('Downloaden mislukt' . ($err ? " ($err)" : ''));
    }

    /** Pakt de zip uit na controle op onveilige paden; geeft de map met de projectbestanden terug. */
    private static function extract(string $zipPath, string $to): string
    {
        $za = new ZipArchive();
        if ($za->open($zipPath) !== true) throw new RuntimeException('Download is geen geldig zip-bestand');
        for ($i = 0; $i < $za->numFiles; $i++) {
            $name = (string)$za->getNameIndex($i);
            if ($name === '' || $name[0] === '/' || str_contains($name, "\0") || str_contains($name, '\\')
                || in_array('..', explode('/', $name), true)) {
                $za->close();
                throw new RuntimeException('Zip bevat een onveilig pad');
            }
        }
        if (!mkdir($to, 0700) || !$za->extractTo($to)) { $za->close(); throw new RuntimeException('Uitpakken mislukt'); }
        $za->close();
        $dirs = glob($to . '/*', GLOB_ONLYDIR) ?: [];
        if (count($dirs) !== 1 || !is_file($dirs[0] . '/public/index.php') || !is_file($dirs[0] . '/src/bootstrap.php')) {
            throw new RuntimeException('Onverwachte inhoud van de download');
        }
        return $dirs[0];
    }

    /** @return list<string> relatieve paden die geïnstalleerd worden; controleert ook of alles schrijfbaar is */
    private static function plan(string $src): array
    {
        $root = self::root();
        $files = [];
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($src, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if (!$f->isFile() || $f->isLink()) continue;
            $rel = substr($f->getPathname(), strlen($src) + 1);
            if (in_array(explode('/', $rel)[0], self::KEEP, true)) continue;
            $target = $root . '/' . $rel;
            $probe = file_exists($target) ? $target : dirname($target);
            while (!file_exists($probe)) $probe = dirname($probe);
            if (!is_writable($probe)) throw new RuntimeException("Geen schrijfrechten voor $rel");
            $files[] = $rel;
        }
        return $files;
    }

    /** @param list<string> $files */
    private static function apply(string $src, array $files, string $backupDir): void
    {
        $root = self::root();
        foreach ($files as $rel) {
            $target = $root . '/' . $rel;
            if (is_file($target)) {
                if (!is_dir(dirname($backupDir . '/' . $rel)) && !mkdir(dirname($backupDir . '/' . $rel), 0700, true)) {
                    throw new RuntimeException('Back-upmap niet te maken');
                }
                if (!copy($target, $backupDir . '/' . $rel)) throw new RuntimeException("Back-up van $rel mislukt");
            }
        }
        foreach ($files as $rel) {
            $target = $root . '/' . $rel;
            if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0770, true)) throw new RuntimeException("Map voor $rel niet te maken");
            $tmp = $target . '.upd' . bin2hex(random_bytes(3));
            if (!copy($src . '/' . $rel, $tmp)) throw new RuntimeException("Kopiëren van $rel mislukt");
            @chmod($tmp, is_file($target) ? (fileperms($target) & 0777) : 0660);
            if (!rename($tmp, $target)) { @unlink($tmp); throw new RuntimeException("Installeren van $rel mislukt"); }
        }
        // alleen de laatste back-up bewaren
        $all = glob(dirname($backupDir) . '/backup-*', GLOB_ONLYDIR) ?: [];
        rsort($all);
        foreach (array_slice($all, 1) as $old) self::rrmdir($old);
    }

    private static function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
            $f->isDir() && !$f->isLink() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
        }
        @rmdir($dir);
    }
}
