<?php

declare(strict_types=1);

namespace App\Cache;

/** Minimal time-to-live cache. Values must be JSON-serialisable (arrays, scalars, null). */
interface TtlCache
{
    /**
     * Returns the cached value, or computes it with $producer, stores it for $ttlSeconds and returns it.
     * A producer that throws caches nothing.
     */
    public function remember(string $key, int $ttlSeconds, callable $producer): mixed;

    /** Drops everything in this cache's namespace. */
    public function clear(): void;
}
