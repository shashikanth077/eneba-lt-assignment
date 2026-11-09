<?php

declare(strict_types=1);

namespace Tests;

use App\Home\HomeBlockRegistry;
use App\Support\KeyCipher;
use Database\Seeds\DatabaseSeeder;

/** The homepage on the real seeded data: the rows the seeder writes must match the blocks the backend serves. */
final class HomeSeededTest extends DbTestCase
{
    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();
        if (!isset(self::$pdo)) {
            return;
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['game_keys', 'deals', 'product_stats', 'offers', 'products', 'sellers', 'regions', 'platforms', 'banners', 'home_blocks'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        (new DatabaseSeeder(self::$pdo, KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY'])))->run();
    }

    public function testEverySeededRowHasABlockAndTheEndpointsMatch(): void
    {
        $classes = require __DIR__ . '/../config/home.php';
        $registered = [];
        foreach ($classes as $class) {
            $registered[$class::SLUG] = $class::PATH;
        }
        $rows = self::$pdo->query('SELECT slug, endpoint FROM home_blocks')->fetchAll();

        self::assertCount(4, $rows);
        foreach ($rows as $row) {
            self::assertArrayHasKey($row['slug'], $registered, "seeded row '{$row['slug']}' has no backend block");
            self::assertSame($registered[$row['slug']], $row['endpoint'], "endpoint of '{$row['slug']}'");
        }
        self::assertCount(4, $registered, 'and no registered block lacks a seeded row');
    }

    public function testSeededLayoutAndBlocksProduceRealContent(): void
    {
        $layout = $this->get('/api/home/layout')['blocks'];
        self::assertSame(['banner', 'best_sellers', 'deals', 'new_releases'], array_column($layout, 'id'));

        foreach ($layout as $block) {
            $items = $this->get($block['endpoint'])['items'];
            self::assertNotEmpty($items, $block['id'] . ' has content');
            self::assertLessThanOrEqual($block['config']['limit'] ?? 4, count($items), $block['id'] . ' honours its limit');
        }

        $deals = $this->get('/api/home/deals')['items'];
        $discounts = array_column($deals, 'discountPct');
        $sorted = $discounts;
        rsort($sorted);
        self::assertSame($sorted, $discounts, 'deals come biggest discount first');
        foreach ($deals as $deal) {
            self::assertGreaterThan($deal['fromPriceCents'], $deal['originalPriceCents'], $deal['name'] . ': the crossed-out price is higher');
        }

        $sold = array_map(
            static fn (string $slug): int => (int) self::$pdo->query("SELECT units_sold FROM product_stats WHERE product_id = (SELECT id FROM products WHERE slug = '$slug')")->fetchColumn(),
            array_column($this->get('/api/home/best-sellers')['items'], 'slug'),
        );
        $sortedSold = $sold;
        rsort($sortedSold);
        self::assertSame($sortedSold, $sold, 'best sellers come by units sold');

        $dates = array_map(
            static fn (string $slug): string => (string) self::$pdo->query("SELECT release_date FROM products WHERE slug = '$slug'")->fetchColumn(),
            array_column($this->get('/api/home/new-releases')['items'], 'slug'),
        );
        $sortedDates = $dates;
        rsort($sortedDates);
        self::assertSame($sortedDates, $dates, 'new releases come newest first');
        self::assertLessThanOrEqual(date('Y-m-d'), $dates[0], 'and are already released');
    }

    public function testEveryBannerImageUrlResolves(): void
    {
        foreach ($this->get('/api/home/banners')['items'] as $banner) {
            $image = $this->send('GET', $banner['imageUrl']);

            self::assertSame(200, $image->getStatusCode(), $banner['imageUrl']);
            self::assertStringStartsWith('image/svg+xml', $image->getHeaderLine('Content-Type'));
        }
    }

    public function testRegistryBuildsEveryBlockFromTheContainer(): void
    {
        $registry = new HomeBlockRegistry(new class () implements \Psr\Container\ContainerInterface {
            public function get(string $id): mixed
            {
                return new $id(\Tests\HomeSeededTest::pdo(), new \App\Cache\NullTtlCache());
            }

            public function has(string $id): bool
            {
                return true;
            }
        }, require __DIR__ . '/../config/home.php');

        self::assertCount(4, $registry->routes());
        self::assertTrue($registry->has('deals'));
        self::assertFalse($registry->has('nope'));
        self::assertSame('/api/home/deals', $registry->get('deals')->path());
        $this->expectException(\OutOfBoundsException::class);
        $registry->get('nope');
    }

    public static function pdo(): \PDO
    {
        return self::$pdo;
    }

    /** @return array<string, mixed> */
    private function get(string $path): array
    {
        $response = $this->send('GET', $path);
        self::assertSame(200, $response->getStatusCode(), $path . ' => ' . $response->getBody());

        return $this->json($response);
    }
}
