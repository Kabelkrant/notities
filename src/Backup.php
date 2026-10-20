<?php
declare(strict_types=1);

/**
 * Automatische back-ups van notes.json. Bij een wijziging wordt, als de laatste back-up ouder is dan het interval,
 * eerst de stand van vóór die wijziging bewaard in data/backups/notes-<datum>-<tijd>-<microseconden>.json.
 *
 * .env: BACKUP_EVERY_HOURS (standaard 1; 0 = uit) en BACKUP_KEEP (standaard 100; oudere worden verwijderd).
 * data/backups/last is een leeg bestand waarvan de wijzigingstijd het moment van de laatste back-up is (één stat per schrijfactie).
 * Een mislukte back-up mag het opslaan nooit blokkeren.
 */
final class Backup
{
    public static function maybe(string $dir, string $raw): void
    {
        try {
            $hours = max(0, min(8760, (float)(Auth::env('BACKUP_EVERY_HOURS') ?? 1)));
            if ($hours <= 0 || trim($raw) === '') return;
            $last = $dir . '/last';
            clearstatcache(true, $last);
            $at = @filemtime($last);
            if ($at !== false && time() - $at < $hours * 3600) return;
            self::make($dir, $raw);
            @touch($last);
        } catch (Throwable $e) {
            error_log('Back-up mislukt: ' . $e->getMessage());
        }
    }

    private static function make(string $dir, string $raw): void
    {
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException('Back-upmap niet te maken');
        }
        $name = 'notes-' . (new DateTimeImmutable())->format('Ymd-His-u') . '.json';
        $tmp = "$dir/$name.tmp";
        if (file_put_contents($tmp, $raw) !== strlen($raw) || !chmod($tmp, 0600) || !rename($tmp, "$dir/$name")) {
            @unlink($tmp);
            throw new RuntimeException('Back-up schrijven mislukt');
        }
        $keep = max(1, min(10000, (int)(Auth::env('BACKUP_KEEP') ?: 100)));
        $files = glob("$dir/notes-*.json") ?: [];
        sort($files); // de naam bevat datum en tijd, dus oudste eerst
        foreach (array_slice($files, 0, max(0, count($files) - $keep)) as $old) @unlink($old);
    }
}
