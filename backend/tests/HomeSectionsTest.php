<?php

declare(strict_types=1);

namespace Tests;

use App\Support\KeyCipher;
use Database\Seeds\DatabaseSeeder;

/** The homepage sections added after the first version: categories strip, recently viewed, recommended, upcoming. */
final class HomeSectionsTest extends DbTestCase
{
    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();
        if (!isset(self::$pdo)) {
            return;
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['game_keys', 'order_items', 'orders', 'deals', 'product_stats', 'offers', 'products', 'sellers', 'regions', 'platforms', 'banners', 'home_blocks'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        (new DatabaseSeeder(self::$pdo, KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY'])))->run();
    }

    /** @return array<string, mixed> */
    private function items(string $path): array
    {
        return $this->json($this->send('GET', $path))['items'];
    }

    public function testTheLayoutListsEverySectionInOrderAndKeepsTheBrowserOnlyOne(): void
    {
        $blocks = $this->json($this->send('GET', '/api/home/layout'))['blocks'];

        self::assertSame(
            ['banner', 'categories', 'recently_viewed', 'recommended', 'best_sellers', 'deals', 'new_releases', 'upcoming'],
            array_column($blocks, 'id'),
        );
        $recent = $blocks[2];
        self::assertSame(['type' => 'recent', 'endpoint' => ''], ['type' => $recent['type'], 'endpoint' => $recent['endpoint']], 'no endpoint: drawn in the browser');
    }

    public function testCategoriesLeadToStorePagesThatHaveProducts(): void
    {
        $items = $this->items('/api/home/categories');

        self::assertSame('games', $items[0]['id']);
        self::assertSame('/store', $items[0]['to']);
        self::assertGreaterThan(5, count($items));
        foreach (array_slice($items, 1) as $item) {
            parse_str((string) parse_url($item['to'], PHP_URL_QUERY), $query);
            $total = $this->json($this->send('GET', '/api/products?' . http_build_query($query)))['total'];
            self::assertGreaterThan(0, $total, $item['label'] . ' has products');
            self::assertNotSame('', $item['icon']);
        }
    }

    public function testUpcomingGamesAreInTheFutureSoonestFirstAndBuyable(): void
    {
        $items = $this->items('/api/home/upcoming');

        self::assertNotEmpty($items);
        $dates = array_column($items, 'releaseDate');
        foreach ($dates as $date) {
            self::assertGreaterThan(date('Y-m-d'), $date);
        }
        $sorted = $dates;
        sort($sorted);
        self::assertSame($sorted, $dates);
        self::assertTrue($items[0]['inStock']);
    }

    public function testRecommendedGamesAreBuyableAndDifferFromBestSellers(): void
    {
        $recommended = $this->items('/api/home/recommended');
        $best = array_column($this->items('/api/home/best-sellers'), 'slug');

        self::assertCount(10, $recommended);
        foreach ($recommended as $card) {
            self::assertTrue($card['inStock']);
            self::assertIsInt($card['fromPriceCents']);
        }
        self::assertNotSame($best, array_column($recommended, 'slug'));
    }

    public function testRecentlyViewedGamesAreFetchedBySlugThroughTheCatalogue(): void
    {
        $slugs = array_slice(array_column($this->items('/api/home/best-sellers'), 'slug'), 0, 3);

        $body = $this->json($this->send('GET', '/api/products?' . http_build_query(['slug' => $slugs])));

        self::assertSame(3, $body['total']);
        self::assertEqualsCanonicalizing($slugs, array_column($body['items'], 'slug'));
        self::assertSame(422, $this->send('GET', '/api/products?slug[]=' . rawurlencode("x'; DROP TABLE products;--"))->getStatusCode());
    }

    public function testAReSeedKeepsTheUpcomingSetAndTheLayout(): void
    {
        $before = array_column($this->items('/api/home/upcoming'), 'slug');
        $blocks = (int) self::$pdo->query('SELECT COUNT(*) FROM home_blocks')->fetchColumn();

        (new DatabaseSeeder(self::$pdo, KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY'])))->run();

        self::assertSame($before, array_column($this->items('/api/home/upcoming'), 'slug'));
        self::assertSame($blocks, (int) self::$pdo->query('SELECT COUNT(*) FROM home_blocks')->fetchColumn());
    }
}
