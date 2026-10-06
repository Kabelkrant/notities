<?php
declare(strict_types=1);

/**
 * Opslag van notities in één JSON-bestand: {"next_id": int, "notes": [...]}.
 * Alle toegang loopt via flock, zodat gelijktijdige requests elkaar niet overschrijven.
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

    /** @param array<string,mixed> $changes */
    public function update(int $id, array $changes): ?array
    {
        return $this->read(function (array &$d) use ($id, $changes) {
            foreach ($d['notes'] as &$n) {
                if ($n['id'] === $id) {
                    $n = array_merge($n, $changes, ['updated' => date('Y-m-d H:i:s')]);
                    return $n;
                }
            }
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
        $fh = fopen($this->path, 'c+');
        if (!$fh) throw new RuntimeException('Databestand niet te openen');
        try {
            if (!flock($fh, $write ? LOCK_EX : LOCK_SH)) throw new RuntimeException('Lock mislukt');
            $raw = stream_get_contents($fh);
            $data = $raw === '' ? ['next_id' => 1, 'notes' => []] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            $result = $fn($data);
            if ($write) {
                $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
                rewind($fh);
                ftruncate($fh, 0);
                fwrite($fh, $json);
                fflush($fh);
            }
            return $result;
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}
