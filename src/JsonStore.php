<?php
declare(strict_types=1);

/** De notitie is intussen gewijzigd t.o.v. de versie waarop de bewerking gebaseerd was. */
final class ConflictException extends RuntimeException {}

/**
 * Opslag van notities in één JSON-bestand: {"next_id": int, "notes": [...]}.
 * Alle toegang loopt via flock op een apart lock-bestand, zodat gelijktijdige requests elkaar niet
 * overschrijven. Schrijven gaat atomair (tijdelijk bestand + rename): een crash laat nooit een halve JSON achter.
 */
final class JsonStore
{
    public function __construct(private string $path) {}

    /** @return list<array<string,mixed>> */
    public function all(): array
    {
        $notes = $this->read(fn(array $d) => $d['notes'], write: false);
        usort($notes, fn($a, $b) => [$a['updated'], $a['id']] <=> [$b['updated'], $b['id']]);
        return $notes;
    }

    public function find(int $id): ?array
    {
        foreach ($this->all() as $n) if ($n['id'] === $id) return $n;
        return null;
    }

    /** @param array<string,mixed> $fields */
    public function create(array $fields): array
    {
        return $this->read(function (array &$d) use ($fields) {
            $now = date('Y-m-d H:i:s');
            $note = ['id' => $d['next_id']++] + $fields + ['created' => $now, 'updated' => $now];
            $d['notes'][] = $note;
            return $note;
        }, write: true);
    }

    /**
     * @param array<string,mixed> $changes
     * @param array<string,mixed>|null $expect velden die nog precies zo moeten zijn als de client dacht; anders ConflictException
     */
    public function update(int $id, array $changes, ?array $expect = null): ?array
    {
        return $this->read(function (array &$d) use ($id, $changes, $expect) {
            foreach ($d['notes'] as &$n) {
                if ($n['id'] === $id) {
                    foreach ($expect ?? [] as $k => $v) {
                        if (($n[$k] ?? null) !== $v) throw new ConflictException();
                    }
                    $n = array_merge($n, $changes, ['updated' => date('Y-m-d H:i:s')]);
                    return $n;
                }
            }
            return null;
        }, write: true);
    }

    /**
     * Zet de volgorde van de notitie-app (veld 'order') zonder 'updated' aan te raken: de stapelvolgorde op het canvas hangt van 'updated' af
     * en moet door het herordenen van de lijst niet veranderen.
     * @param array<int,int> $order notitie-id => volgnummer
     */
    public function setOrder(array $order): void
    {
        $this->read(function (array &$d) use ($order) {
            foreach ($d['notes'] as &$n) if (isset($order[$n['id']])) $n['order'] = $order[$n['id']];
            return null;
        }, write: true);
    }

    /** Verwijdert een notitie en geeft die terug (null als hij niet bestond). */
    public function delete(int $id): ?array
    {
        return $this->read(function (array &$d) use ($id) {
            $removed = null;
            foreach ($d['notes'] as $i => $n) {
                if ($n['id'] === $id) { $removed = $n; unset($d['notes'][$i]); }
            }
            $d['notes'] = array_values($d['notes']);
            return $removed;
        }, write: true);
    }

    private function read(callable $fn, bool $write): mixed
    {
        $lock = fopen($this->path . '.lock', 'c');
        if (!$lock) throw new RuntimeException('Lockbestand niet te openen');
        try {
            if (!flock($lock, $write ? LOCK_EX : LOCK_SH)) throw new RuntimeException('Lock mislukt');
            $raw = is_file($this->path) ? file_get_contents($this->path) : '';
            if ($raw === false) throw new RuntimeException('Databestand niet te lezen');
            $data = trim($raw) === '' ? ['next_id' => 1, 'notes' => []] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            $result = $fn($data);
            if ($write) {
                Backup::maybe(dirname($this->path) . '/backups', $raw); // de stand van vóór deze wijziging, hooguit eens per interval
                $this->writeAtomic(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
            }
            return $result;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    private function writeAtomic(string $json): void
    {
        $tmp = $this->path . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $fh = fopen($tmp, 'wb');
        if (!$fh) throw new RuntimeException('Tijdelijk bestand niet te maken');
        try {
            if (fwrite($fh, $json) !== strlen($json) || !fflush($fh)) throw new RuntimeException('Schrijven mislukt');
            fsync($fh);
            fclose($fh);
            @chmod($tmp, 0600);
            if (!rename($tmp, $this->path)) throw new RuntimeException('Opslaan mislukt');
        } catch (Throwable $e) {
            if (is_resource($fh)) fclose($fh);
            @unlink($tmp);
            throw $e;
        }
    }
}
