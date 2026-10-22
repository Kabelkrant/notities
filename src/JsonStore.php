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
    /** Naam van map 0: waar notities zonder (bestaande) map staan. */
    public const GENERAL = '(niet ingedeeld)';
    /** Systeemmap voor weggegooide notities (id -1): niet op het canvas; definitief verwijderen kan alleen vanuit deze map. */
    public const TRASH = 'Prullenbak';

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
     * Verplaatst meerdere items in één keer (slepen van een selectie op het canvas): één schrijfactie in plaats van één per item.
     * @param list<array{0:int,1:int,2:int}> $moves [id, x, y]
     */
    public function moveMany(array $moves): int
    {
        return $this->read(function (array &$d) use ($moves) {
            $to = [];
            foreach ($moves as [$id, $x, $y]) $to[$id] = [$x, $y];
            $n = 0;
            $now = date('Y-m-d H:i:s');
            foreach ($d['notes'] as &$note) {
                if (isset($to[$note['id']])) { [$note['x'], $note['y']] = $to[$note['id']]; $note['updated'] = $now; $n++; }
            }
            return $n;
        }, write: true);
    }

    /* ---------- Mappen van de notitie-app (hoogstens één niveau diep) ----------
     * 'folders' is een geordende lijst {id, name}; map 0 '(niet ingedeeld)' bestaat altijd en vangt notities zonder (bestaande) map op.
     * Mapindeling en volgorde raken 'updated' van een notitie niet aan, zodat de stapelvolgorde op het canvas gelijk blijft. */
    private function folderList(array $d): array
    {
        $f = array_values($d['folders'] ?? []);
        if (!array_filter($f, fn($x) => $x['id'] === 0)) array_unshift($f, ['id' => 0, 'name' => self::GENERAL]);
        if (!array_filter($f, fn($x) => $x['id'] === -1)) $f[] = ['id' => -1, 'name' => self::TRASH];
        return array_map(fn($x) => $x['id'] === 0 ? ['id' => 0, 'name' => self::GENERAL] : ($x['id'] === -1 ? ['id' => -1, 'name' => self::TRASH] : $x), $f); // de namen van de systeemmappen staan vast
    }

    /** @return list<array{id:int,name:string}> */
    public function folders(): array
    {
        return $this->read(fn(array $d) => $this->folderList($d), write: false);
    }

    public function createFolder(string $name): array
    {
        return $this->read(function (array &$d) use ($name) {
            $d['folders'] = $this->folderList($d);
            $id = $d['next_folder_id'] ?? 1;
            $d['next_folder_id'] = $id + 1;
            $folder = ['id' => $id, 'name' => $name];
            $at = array_search(-1, array_column($d['folders'], 'id'), true); // nieuwe mappen komen vóór de Prullenbak
            array_splice($d['folders'], $at === false ? count($d['folders']) : $at, 0, [$folder]);
            return $folder;
        }, write: true);
    }

    public function renameFolder(int $id, string $name): bool
    {
        return $this->read(function (array &$d) use ($id, $name) {
            $d['folders'] = $this->folderList($d);
            foreach ($d['folders'] as &$f) if ($f['id'] === $id) { $f['name'] = $name; return true; }
            return false;
        }, write: true);
    }

    /** Verwijdert een map; de notities erin verhuizen naar de map (niet ingedeeld). De systeemmappen (0 en -1) kunnen niet weg. */
    public function deleteFolder(int $id): bool
    {
        if ($id <= 0) return false; // Systeemmappen (0 en -1) kunnen niet weg
        return $this->read(function (array &$d) use ($id) {
            $d['folders'] = $this->folderList($d);
            $before = count($d['folders']);
            $d['folders'] = array_values(array_filter($d['folders'], fn($f) => $f['id'] !== $id));
            foreach ($d['notes'] as &$n) if (($n['folder'] ?? 0) === $id) $n['folder'] = 0;
            return count($d['folders']) < $before;
        }, write: true);
    }

    /**
     * Zet in één keer de volgorde van de mappen en in welke map elke notitie staat. De volgorde van de notities zelf is niet instelbaar:
     * binnen een map staan ze op laatst inhoudelijk bijgewerkt (zie 'edited').
     * @param list<int> $folderOrder map-id's in de nieuwe volgorde
     * @param list<array{0:int,1:int}> $layout [notitie-id, map-id]
     */
    public function organize(array $folderOrder, array $layout): void
    {
        $this->read(function (array &$d) use ($folderOrder, $layout) {
            $folders = $this->folderList($d);
            $byId = array_column($folders, null, 'id');
            $sorted = [];
            foreach ($folderOrder as $fid) if (isset($byId[$fid])) { $sorted[] = $byId[$fid]; unset($byId[$fid]); }
            $d['folders'] = array_merge($sorted, array_values($byId)); // onbekende of vergeten mappen blijven achteraan staan
            $known = array_column($d['folders'], 'id');
            $to = [];
            foreach ($layout as [$nid, $fid]) $to[$nid] = in_array($fid, $known, true) ? $fid : 0;
            foreach ($d['notes'] as &$n) if (($n['type'] ?? 'note') === 'note' && isset($to[$n['id']])) $n['folder'] = $to[$n['id']];
            return null;
        }, write: true);
    }

    /** Verplaatst een notitie naar een andere map (een onbekende map wordt (niet ingedeeld)). Alleen notities hebben een map. */
    public function setNoteFolder(int $id, int $folder): ?array
    {
        return $this->read(function (array &$d) use ($id, $folder) {
            if (!in_array($folder, array_column($this->folderList($d), 'id'), true)) $folder = 0;
            foreach ($d['notes'] as &$n) {
                if ($n['id'] === $id && ($n['type'] ?? 'note') === 'note') { $n['folder'] = $folder; return $n; }
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
