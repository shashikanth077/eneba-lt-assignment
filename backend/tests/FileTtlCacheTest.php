<?php

declare(strict_types=1);

namespace Tests;

use App\Cache\CacheFactory;
use App\Cache\FileTtlCache;
use App\Cache\NullTtlCache;
use PHPUnit\Framework\TestCase;

final class FileTtlCacheTest extends TestCase
{
    private string $dir;
    private int $now = 1_000_000;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/keymart-cache-test-' . bin2hex(random_bytes(4));
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/*/*') ?: [] as $file) {
            @unlink($file);
        }
        foreach (glob($this->dir . '/*') ?: [] as $folder) {
            @rmdir($folder);
        }
        @rmdir($this->dir);
    }

    private function cache(string $namespace = 'block'): FileTtlCache
    {
        return new FileTtlCache($this->dir, $namespace, fn (): int => $this->now);
    }

    public function testSecondCallWithinTheTtlIsServedFromTheCache(): void
    {
        $calls = 0;
        $producer = function () use (&$calls): array {
            $calls++;

            return ['items' => [1, 2, 3]];
        };

        self::assertSame(['items' => [1, 2, 3]], $this->cache()->remember('k', 60, $producer));
        self::assertSame(['items' => [1, 2, 3]], $this->cache()->remember('k', 60, $producer), 'a new instance reads the same files');
        self::assertSame(1, $calls);
    }

    public function testEntriesExpireExactlyAtTheTtl(): void
    {
        $calls = 0;
        $producer = function () use (&$calls): int {
            return ++$calls;
        };

        self::assertSame(1, $this->cache()->remember('k', 60, $producer));
        $this->now += 59;
        self::assertSame(1, $this->cache()->remember('k', 60, $producer), '59 s later: still cached');
        $this->now += 1;
        self::assertSame(2, $this->cache()->remember('k', 60, $producer), '60 s later: expired, recomputed');
        self::assertSame(2, $this->cache()->remember('k', 60, $producer), 'and cached again');
    }

    public function testFalsyAndNullValuesAreCachedToo(): void
    {
        foreach ([null, 0, '', [], false] as $i => $value) {
            $calls = 0;
            $producer = function () use (&$calls, $value) {
                $calls++;

                return $value;
            };
            self::assertSame($value, $this->cache()->remember("falsy-$i", 60, $producer));
            self::assertSame($value, $this->cache()->remember("falsy-$i", 60, $producer));
            self::assertSame(1, $calls, 'cached: ' . var_export($value, true));
        }
    }

    public function testDifferentKeysAreIndependent(): void
    {
        self::assertSame('a', $this->cache()->remember('limit=5', 60, fn () => 'a'));
        self::assertSame('b', $this->cache()->remember('limit=10', 60, fn () => 'b'));
        self::assertSame('a', $this->cache()->remember('limit=5', 60, fn () => 'never'));
    }

    public function testAFailingProducerCachesNothing(): void
    {
        try {
            $this->cache()->remember('k', 60, fn () => throw new \RuntimeException('db down'));
            self::fail('expected the exception to propagate');
        } catch (\RuntimeException) {
        }

        self::assertSame('recovered', $this->cache()->remember('k', 60, fn () => 'recovered'));
    }

    public function testNamespacesAreIsolatedAndClearOnlyAffectsItsOwn(): void
    {
        $this->cache('deals')->remember('k', 60, fn () => 'deals-value');
        $this->cache('banner')->remember('k', 60, fn () => 'banner-value');

        $this->cache('deals')->clear();

        self::assertSame('deals-new', $this->cache('deals')->remember('k', 60, fn () => 'deals-new'), 'cleared');
        self::assertSame('banner-value', $this->cache('banner')->remember('k', 60, fn () => 'banner-new'), 'untouched');
    }

    public function testNamespaceCannotEscapeTheCacheDirectory(): void
    {
        $this->cache('../../evil')->remember('k', 60, fn () => 'x');

        $files = glob($this->dir . '/*/*.json') ?: [];
        self::assertCount(1, $files);
        self::assertStringStartsWith($this->dir . '/', (string) realpath($files[0]));
    }

    public function testACorruptFileIsAMissAndGetsRepaired(): void
    {
        $this->cache()->remember('k', 60, fn () => 'good');
        $file = (glob($this->dir . '/block/*.json') ?: [])[0];
        file_put_contents($file, '{"expires": 9999999999, "val');

        self::assertSame('fresh', $this->cache()->remember('k', 60, fn () => 'fresh'));
        self::assertSame('fresh', $this->cache()->remember('k', 60, fn () => 'again'), 'repaired by the write');
    }

    public function testAnUnwritableDirectoryNeverBreaksTheCaller(): void
    {
        $blocker = sys_get_temp_dir() . '/keymart-not-a-dir-' . bin2hex(random_bytes(4));
        file_put_contents($blocker, 'a file where the cache directory should be');
        $calls = 0;
        $cache = new FileTtlCache($blocker . '/sub', 'block');

        $first = $cache->remember('k', 60, function () use (&$calls) {
            return ++$calls;
        });
        $second = $cache->remember('k', 60, function () use (&$calls) {
            return ++$calls;
        });
        @unlink($blocker);

        self::assertSame([1, 2], [$first, $second], 'no caching, but the values still come back');
    }

    public function testAValueThatCannotBeEncodedIsReturnedButNotCached(): void
    {
        $calls = 0;
        $producer = function () use (&$calls): float {
            $calls++;

            return INF; // JSON cannot represent infinity
        };

        self::assertSame(INF, $this->cache()->remember('k', 60, $producer));
        $this->cache()->remember('k', 60, $producer);
        self::assertSame(2, $calls);
    }

    public function testFactoryBuildsTheConfiguredDriver(): void
    {
        self::assertInstanceOf(NullTtlCache::class, (new CacheFactory('none', $this->dir))->for('x'));
        self::assertInstanceOf(FileTtlCache::class, (new CacheFactory('file', $this->dir))->for('x'));

        $this->expectException(\RuntimeException::class);
        (new CacheFactory('redis', $this->dir))->for('x');
    }

    public function testNullCacheAlwaysRecomputes(): void
    {
        $calls = 0;
        $cache = new NullTtlCache();
        $producer = function () use (&$calls): int {
            return ++$calls;
        };

        self::assertSame(1, $cache->remember('k', 60, $producer));
        self::assertSame(2, $cache->remember('k', 60, $producer));
    }
}
