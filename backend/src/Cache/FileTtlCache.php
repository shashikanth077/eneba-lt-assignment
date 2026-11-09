<?php

declare(strict_types=1);

namespace App\Cache;

use Closure;
use JsonException;

/**
 * One JSON file per key under <dir>/<namespace>/. Best-effort by design: if the directory is not writable or a file is
 * corrupt the cache silently behaves like a miss, so a cache problem can never break a page.
 *
 * Writes are atomic (temp file + rename), so a reader never sees half a file. There is no stampede protection: when a
 * key expires, concurrent requests may each recompute it once, which is fine for the cheap queries cached here.
 */
final class FileTtlCache implements TtlCache
{
    private readonly Closure $clock;

    /** @param Closure(): int|null $clock unix time source; tests inject a fake one */
    public function __construct(
        private readonly string $directory,
        private readonly string $namespace,
        ?Closure $clock = null,
    ) {
        $this->clock = $clock ?? static fn (): int => time();
    }

    public function remember(string $key, int $ttlSeconds, callable $producer): mixed
    {
        $entry = $this->read($key);
        if ($entry !== null) {
            return $entry['value'];
        }

        $value = $producer();
        $this->write($key, $ttlSeconds, $value);

        return $value;
    }

    public function clear(): void
    {
        foreach (glob($this->folder() . '/*.json') ?: [] as $file) {
            @unlink($file);
        }
    }

    /** @return array{value: mixed}|null */
    private function read(string $key): ?array
    {
        $path = $this->path($key);
        $raw = @file_get_contents($path);
        if ($raw === false) {
            return null;
        }
        try {
            $entry = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null; // corrupt file: treat as a miss, it is overwritten on the next write
        }
        if (!is_array($entry) || !isset($entry['expires']) || !array_key_exists('value', $entry)) {
            return null;
        }
        if ((int) $entry['expires'] <= ($this->clock)()) {
            @unlink($path);

            return null;
        }

        return ['value' => $entry['value']];
    }

    private function write(string $key, int $ttlSeconds, mixed $value): void
    {
        try {
            $json = json_encode(['expires' => ($this->clock)() + $ttlSeconds, 'value' => $value], JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return; // not serialisable: skip caching, the caller still gets the value
        }
        $folder = $this->folder();
        if (!is_dir($folder) && !@mkdir($folder, 0775, true) && !is_dir($folder)) {
            return;
        }
        $tmp = @tempnam($folder, 'tmp');
        if ($tmp === false) {
            return;
        }
        if (@file_put_contents($tmp, $json) === false || !@rename($tmp, $this->path($key))) {
            @unlink($tmp);
        }
    }

    private function folder(): string
    {
        return rtrim($this->directory, '/') . '/' . preg_replace('/[^a-z0-9_-]/i', '_', $this->namespace);
    }

    private function path(string $key): string
    {
        return $this->folder() . '/' . sha1($key) . '.json';
    }
}
