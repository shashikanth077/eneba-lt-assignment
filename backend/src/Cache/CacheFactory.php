<?php

declare(strict_types=1);

namespace App\Cache;

/** Builds one isolated cache per namespace (here: per homepage block), so a block can purge or tune only its own. */
final class CacheFactory
{
    public function __construct(private readonly string $driver, private readonly string $directory)
    {
    }

    public function for(string $namespace): TtlCache
    {
        return match ($this->driver) {
            'none' => new NullTtlCache(),
            'file' => new FileTtlCache($this->directory, $namespace),
            default => throw new \RuntimeException("Unknown CACHE_DRIVER '{$this->driver}' (use file or none)"),
        };
    }
}
