<?php

declare(strict_types=1);

namespace App\Cache;

/** Never caches. Used when CACHE_DRIVER=none (tests, debugging). */
final class NullTtlCache implements TtlCache
{
    public function remember(string $key, int $ttlSeconds, callable $producer): mixed
    {
        return $producer();
    }

    public function clear(): void
    {
    }
}
