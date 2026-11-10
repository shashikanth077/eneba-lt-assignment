<?php

declare(strict_types=1);

namespace Tests;

use App\Cache\FileTtlCache;
use App\Home\Blocks\BannersBlock;
use App\Home\Blocks\BestSellersBlock;
use App\Home\Blocks\DealsBlock;
use App\Home\Blocks\NewReleasesBlock;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Homepage blocks through the real HTTP stack. Cache is off in the test environment (CACHE_DRIVER=none), so every
 * request sees the database; the caching tests build blocks by hand with a file cache and a fake clock.
 *
 * Products (units sold / release / offers):
 *   1 alpha    50   -90d  one offer 1000, no deal
 *   2 bravo   500   -30d  one offer 2000, deal -50% (original 4000)               <- best deal
 *   3 charlie 300  -400d  one offer 1500, deal -17% (original 1800, ends in the future)
 *   4 delta   900  +365d  one offer  700                                          (not released yet)
 *   5 echo   1000   -10d  one offer  800, its only key is sold                    (sold out)
 *   6 foxtrot 800   -20d  one offer  800, offer inactive                          (nothing buyable)
 *   7 golf     10  -120d  one offer  900, deal ended yesterday                    (expired deal)
 *   8 hotel    20   -60d  offers 500 (no deal) and 900 (deal -50%)                (deal is not on the cheapest offer)
 */
final class HomeTest extends DbTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->buildFixture();
    }

    // ---- layout ----------------------------------------------------------------------------

    public function testLayoutListsEnabledBlocksInOrderWithTheDocumentedShape(): void
    {
        $body = $this->get('/api/home/layout');

        self::assertSame(['blocks'], array_keys($body));
        self::assertSame(['banner', 'best_sellers', 'deals', 'new_releases'], array_column($body['blocks'], 'id'));
        self::assertSame(['id', 'type', 'title', 'endpoint', 'config'], array_keys($body['blocks'][0]));
        self::assertSame(
            ['id' => 'deals', 'type' => 'carousel', 'title' => 'Hot deals', 'endpoint' => '/api/home/deals', 'config' => ['limit' => 10]],
            $body['blocks'][2],
        );
        self::assertSame(['autoplayMs' => 6000], $body['blocks'][0]['config']);
    }

    /** The "done when": switching a home_blocks row off removes that block from the API output. */
    #[DataProvider('everyBlock')]
    public function testDisablingARowRemovesTheBlockFromTheApi(string $slug, string $endpoint): void
    {
        $others = array_values(array_diff(['banner', 'best_sellers', 'deals', 'new_releases'], [$slug]));
        self::assertContains($slug, array_column($this->get('/api/home/layout')['blocks'], 'id'));
        self::assertSame(200, $this->send('GET', $endpoint)->getStatusCode());

        self::$pdo->prepare('UPDATE home_blocks SET enabled = 0 WHERE slug = ?')->execute([$slug]);

        self::assertSame($others, array_column($this->get('/api/home/layout')['blocks'], 'id'), 'gone from the layout');
        $gone = $this->send('GET', $endpoint);
        self::assertSame(404, $gone->getStatusCode(), 'its endpoint answers like it does not exist');
        self::assertSame('not_found', $this->json($gone)['error']['code']);
        foreach ($this->get('/api/home/layout')['blocks'] as $block) {
            self::assertSame(200, $this->send('GET', $block['endpoint'])->getStatusCode(), $block['id'] . ' is unaffected');
        }

        self::$pdo->prepare('UPDATE home_blocks SET enabled = 1 WHERE slug = ?')->execute([$slug]);
        self::assertContains($slug, array_column($this->get('/api/home/layout')['blocks'], 'id'), 're-enabling brings it back');
        self::assertSame(200, $this->send('GET', $endpoint)->getStatusCode());
    }

    /** @return array<string, array{string, string}> */
    public static function everyBlock(): array
    {
        return [
            'banner' => ['banner', '/api/home/banners'],
            'best_sellers' => ['best_sellers', '/api/home/best-sellers'],
            'deals' => ['deals', '/api/home/deals'],
            'new_releases' => ['new_releases', '/api/home/new-releases'],
        ];
    }

    public function testDisablingEveryRowGivesAnEmptyLayout(): void
    {
        self::$pdo->exec('UPDATE home_blocks SET enabled = 0');

        self::assertSame(['blocks' => []], $this->get('/api/home/layout'));
    }

    public function testPositionDecidesTheOrder(): void
    {
        self::$pdo->exec("UPDATE home_blocks SET position = 10 WHERE slug = 'banner'");
        self::$pdo->exec("UPDATE home_blocks SET position = 0 WHERE slug = 'new_releases'");

        self::assertSame(['new_releases', 'best_sellers', 'deals', 'banner'], array_column($this->get('/api/home/layout')['blocks'], 'id'));
    }

    public function testARowWithoutABackendBlockIsLeftOutOfTheLayout(): void
    {
        self::$pdo->exec("INSERT INTO home_blocks (slug, type, title, endpoint, position, enabled, config) VALUES ('mystery', 'carousel', 'Mystery', '/api/home/mystery', 1, 1, NULL)");

        self::assertNotContains('mystery', array_column($this->get('/api/home/layout')['blocks'], 'id'), 'the frontend must never be sent an endpoint that 404s');
        self::assertSame(404, $this->send('GET', '/api/home/mystery')->getStatusCode());
    }

    public function testAnEmptyConfigIsAnObjectInJson(): void
    {
        self::$pdo->exec("UPDATE home_blocks SET config = NULL WHERE slug = 'deals'");

        $raw = (string) $this->send('GET', '/api/home/layout')->getBody();

        self::assertStringContainsString('"id":"deals","type":"carousel","title":"Hot deals","endpoint":"/api/home/deals","config":{}', $raw);
    }

    // ---- banners ---------------------------------------------------------------------------

    public function testBannersAreActiveOnesInPositionOrder(): void
    {
        $items = $this->get('/api/home/banners')['items'];

        self::assertSame(['Second', 'First'], array_column($items, 'title'), 'by position; the inactive banner is hidden');
        self::assertSame(['id', 'imageUrl', 'title', 'subtitle', 'ctaLabel', 'href'], array_keys($items[0]));
        self::assertSame('/api/images/banners/second.svg', $items[0]['imageUrl']);
        self::assertSame('/store?sort=newest', $items[0]['href']);
    }

    // ---- best sellers ----------------------------------------------------------------------

    public function testBestSellersAreOrderedByUnitsSoldAndOnlyListBuyableProducts(): void
    {
        $items = $this->get('/api/home/best-sellers')['items'];

        self::assertSame(['Delta', 'Bravo', 'Charlie', 'Alpha', 'Hotel', 'Golf'], array_column($items, 'name'), 'echo (sold out) and foxtrot (inactive offer) are excluded');
        self::assertSame(
            ['id', 'slug', 'name', 'coverUrl', 'platform', 'region', 'offerId', 'fromPriceCents', 'offerCount', 'inStock', 'discountPct'],
            array_keys($items[1]),
        );
        self::assertSame(['id', 'slug', 'name', 'coverUrl', 'platform', 'region', 'offerId', 'fromPriceCents', 'offerCount', 'inStock'], array_keys($items[0]), 'no discountPct without a deal');
        self::assertSame(['slug' => 'steam', 'name' => 'Steam'], $items[0]['platform']);
        self::assertSame(700, $items[0]['fromPriceCents']);
        self::assertTrue($items[0]['inStock']);
        self::assertSame(2, $items[4]['offerCount'], 'hotel has two buyable offers');
    }

    public function testTheLimitComesFromTheRowConfigAndIsClamped(): void
    {
        self::$pdo->exec("UPDATE home_blocks SET config = '{\"limit\": 2}' WHERE slug = 'best_sellers'");
        self::assertSame(['Delta', 'Bravo'], array_column($this->get('/api/home/best-sellers')['items'], 'name'));

        self::$pdo->exec("UPDATE home_blocks SET config = '{\"limit\": 0}' WHERE slug = 'best_sellers'");
        self::assertCount(1, $this->get('/api/home/best-sellers')['items'], 'limit 0 is raised to 1');

        self::$pdo->exec("UPDATE home_blocks SET config = '{\"limit\": 5000}' WHERE slug = 'best_sellers'");
        self::assertCount(6, $this->get('/api/home/best-sellers')['items'], 'a huge limit is capped (50) and still returns what exists');

        self::$pdo->exec("UPDATE home_blocks SET config = '{\"limit\": \"abc\"}' WHERE slug = 'best_sellers'");
        self::assertCount(1, $this->get('/api/home/best-sellers')['items'], 'junk is read as 0 and clamped, never a 500');

        self::$pdo->exec("UPDATE home_blocks SET config = '5' WHERE slug = 'best_sellers'");
        self::assertCount(6, $this->get('/api/home/best-sellers')['items'], 'valid JSON that is not an object falls back to the default');
    }

    // ---- deals -----------------------------------------------------------------------------

    public function testDealsShowOnlyProductsWhoseCheapestOfferIsDiscountedBiggestFirst(): void
    {
        $items = $this->get('/api/home/deals')['items'];

        self::assertSame(['Bravo', 'Charlie'], array_column($items, 'name'), 'golf: deal expired; hotel: the deal is on a pricier offer');
        self::assertSame(
            ['id', 'slug', 'name', 'coverUrl', 'platform', 'region', 'offerId', 'fromPriceCents', 'offerCount', 'inStock', 'discountPct', 'originalPriceCents'],
            array_keys($items[0]),
        );
        self::assertSame([2000, 50, 4000], [$items[0]['fromPriceCents'], $items[0]['discountPct'], $items[0]['originalPriceCents']]);
        self::assertSame([1500, 17, 1800], [$items[1]['fromPriceCents'], $items[1]['discountPct'], $items[1]['originalPriceCents']]);
    }

    // ---- new releases ----------------------------------------------------------------------

    public function testNewReleasesAreReleasedBuyableProductsNewestFirst(): void
    {
        $items = $this->get('/api/home/new-releases')['items'];

        self::assertSame(['Bravo', 'Hotel', 'Alpha', 'Golf', 'Charlie'], array_column($items, 'name'), 'delta is not released yet; echo/foxtrot are not buyable');
    }

    // ---- independence of the blocks --------------------------------------------------------

    public function testBlocksShareNothingBeyondTheBaseInterface(): void
    {
        $classes = require __DIR__ . '/../config/home.php';
        self::assertCount(4, $classes);

        $allowedUses = ['App\\Cache\\TtlCache', 'App\\Home\\HomeBlock', 'PDO'];
        foreach ($classes as $class) {
            $reflection = new \ReflectionClass($class);
            $short = $reflection->getShortName();

            self::assertTrue($reflection->implementsInterface(\App\Home\HomeBlock::class), "$short implements HomeBlock");
            self::assertFalse($reflection->getParentClass(), "$short extends nothing");
            self::assertSame([], $reflection->getTraits(), "$short uses no traits");
            self::assertTrue($reflection->isFinal(), "$short is final (no one subclasses a block either)");
            self::assertSame(
                ['PDO', 'App\\Cache\\TtlCache'],
                array_map(static fn (\ReflectionParameter $p): string => (string) $p->getType(), $reflection->getConstructor()?->getParameters() ?? []),
                "$short depends only on a database connection and its own cache",
            );

            preg_match_all('/^use ([^;]+);/m', (string) file_get_contents((string) $reflection->getFileName()), $m);
            self::assertEqualsCanonicalizing($allowedUses, $m[1], "$short imports nothing besides the interface, PDO and the cache interface");
        }
    }

    public function testEveryBlockDeclaresItsOwnSlugAndPathAndTheyAreUnique(): void
    {
        $classes = require __DIR__ . '/../config/home.php';
        $slugs = [];
        $paths = [];
        foreach ($classes as $class) {
            $block = new $class(self::$pdo, new \App\Cache\NullTtlCache());
            self::assertSame($class::SLUG, $block->slug());
            self::assertSame($class::PATH, $block->path());
            self::assertStringStartsWith('/api/home/', $class::PATH);
            $slugs[] = $class::SLUG;
            $paths[] = $class::PATH;
        }

        self::assertCount(4, array_unique($slugs));
        self::assertCount(4, array_unique($paths));
        self::assertSame(
            [BannersBlock::PATH, BestSellersBlock::PATH, DealsBlock::PATH, NewReleasesBlock::PATH],
            array_column(self::$pdo->query('SELECT endpoint FROM home_blocks ORDER BY position')->fetchAll(), 'endpoint'),
            'the home_blocks rows point at the endpoints the blocks really serve',
        );
    }

    // ---- caching (each block owns its own) -------------------------------------------------

    public function testABlockServesFromItsCacheUntilTheTtlExpires(): void
    {
        $dir = sys_get_temp_dir() . '/keymart-home-cache-' . bin2hex(random_bytes(4));
        $now = 5_000_000;
        $clock = static function () use (&$now): int {
            return $now;
        };
        $pdo = self::countingPdo();
        $block = new BestSellersBlock($pdo, new FileTtlCache($dir, BestSellersBlock::SLUG, $clock));

        try {
            $first = $block->fetch(['limit' => 3]);
            self::assertSame(1, $pdo->statements, 'cold: one query');
            self::assertSame(['Delta', 'Bravo', 'Charlie'], array_column($first['items'], 'name'));

            // the data changes underneath...
            self::$pdo->exec("UPDATE product_stats SET units_sold = 5000 WHERE product_id = 1");

            self::assertSame($first, $block->fetch(['limit' => 3]), 'warm: the cached payload, even though the data moved');
            self::assertSame(1, $pdo->statements, 'warm: the database was not touched');

            self::assertSame($first, $block->fetch(['limit' => 3, 'unrelated' => 1]), 'config keys the block does not use do not change its cache key');

            $now += BestSellersBlock::TTL_SECONDS - 1;
            $block->fetch(['limit' => 3]);
            self::assertSame(1, $pdo->statements, 'one second before the TTL: still cached');

            $now += 1;
            $fresh = $block->fetch(['limit' => 3]);
            self::assertSame(2, $pdo->statements, 'TTL reached: recomputed');
            self::assertSame(['Alpha', 'Delta', 'Bravo'], array_column($fresh['items'], 'name'), 'and the new data is visible');

            $block->fetch(['limit' => 5]);
            self::assertSame(3, $pdo->statements, 'a different limit is a different cache key');
        } finally {
            foreach (glob($dir . '/*/*') ?: [] as $file) {
                @unlink($file);
            }
            foreach (glob($dir . '/*') ?: [] as $folder) {
                @rmdir($folder);
            }
            @rmdir($dir);
        }
    }

    public function testBlocksCacheIndependentlyAndWithTheirOwnTtl(): void
    {
        $dir = sys_get_temp_dir() . '/keymart-home-cache-' . bin2hex(random_bytes(4));
        $now = 7_000_000;
        $clock = static function () use (&$now): int {
            return $now;
        };
        $pdo = self::countingPdo();
        $deals = new DealsBlock($pdo, new FileTtlCache($dir, DealsBlock::SLUG, $clock));
        $banners = new BannersBlock($pdo, new FileTtlCache($dir, BannersBlock::SLUG, $clock));

        try {
            $deals->fetch([]);
            $banners->fetch([]);
            self::assertSame(2, $pdo->statements);

            $now += DealsBlock::TTL_SECONDS; // deals (2 min) expire, banners (5 min) do not
            $deals->fetch([]);
            $banners->fetch([]);
            self::assertSame(3, $pdo->statements, 'only the deals block went back to the database');

            self::assertLessThan(BannersBlock::TTL_SECONDS, DealsBlock::TTL_SECONDS, 'deals expire, so they get the shortest TTL');
            self::assertCount(2, glob($dir . '/*') ?: [], 'one folder per block');
        } finally {
            foreach (glob($dir . '/*/*') ?: [] as $file) {
                @unlink($file);
            }
            foreach (glob($dir . '/*') ?: [] as $folder) {
                @rmdir($folder);
            }
            @rmdir($dir);
        }
    }

    // ---- helpers & fixture -----------------------------------------------------------------

    /** @return array<string, mixed> */
    private function get(string $path): array
    {
        $response = $this->send('GET', $path);
        self::assertSame(200, $response->getStatusCode(), $path . ' => ' . $response->getBody());

        return $this->json($response);
    }

    private function buildFixture(): void
    {
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['game_keys', 'deals', 'product_stats', 'offers', 'products', 'sellers', 'regions', 'platforms', 'banners', 'home_blocks'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        self::$pdo->exec("INSERT INTO platforms (id, slug, name) VALUES (1,'steam','Steam')");
        self::$pdo->exec("INSERT INTO regions (id, slug, name) VALUES (1,'global','Global')");
        self::$pdo->exec("INSERT INTO sellers (id, name, rating) VALUES (1,'Seller One',4.5),(2,'Seller Two',4.0)");

        $day = static fn (int $offset): string => date('Y-m-d', strtotime(sprintf('%+d days', $offset)));
        // id, name, units sold, release offset (days), offers: [price, keyStatus, active, deal [original, pct, endsAt|null]|null]
        $products = [
            [1, 'Alpha', 50, -90, [[1000, 'available', 1, null]]],
            [2, 'Bravo', 500, -30, [[2000, 'available', 1, [4000, 50, null]]]],
            [3, 'Charlie', 300, -400, [[1500, 'available', 1, [1800, 17, date('Y-m-d H:i:s', strtotime('+7 days'))]]]],
            [4, 'Delta', 900, 365, [[700, 'available', 1, null]]],
            [5, 'Echo', 1000, -10, [[800, 'sold', 1, null]]],
            [6, 'Foxtrot', 800, -20, [[800, 'available', 0, null]]],
            [7, 'Golf', 10, -120, [[900, 'available', 1, [1800, 50, date('Y-m-d H:i:s', strtotime('-1 day'))]]]],
            [8, 'Hotel', 20, -60, [[500, 'available', 1, null], [900, 'available', 1, [1800, 50, null]]]],
        ];
        $product = self::$pdo->prepare('INSERT INTO products (id, slug, name, name_norm, description, genre, publisher, release_date, platform_id, region_id, cover_svg) VALUES (?,?,?,?,?,?,?,?,1,1,?)');
        $stats = self::$pdo->prepare('INSERT INTO product_stats (product_id, units_sold, view_count, popularity) VALUES (?,?,0,?)');
        $offer = self::$pdo->prepare('INSERT INTO offers (id, product_id, seller_id, price_cents, active) VALUES (?,?,?,?,?)');
        $deal = self::$pdo->prepare('INSERT INTO deals (offer_id, original_price_cents, discount_pct, ends_at) VALUES (?,?,?,?)');
        $key = self::$pdo->prepare("INSERT INTO game_keys (offer_id, key_enc, key_hash, status) VALUES (?, 'enc', ?, ?)");
        $offerId = 0;
        foreach ($products as [$id, $name, $units, $releaseOffset, $offers]) {
            $product->execute([$id, strtolower($name), $name, strtolower($name), "$name description", 'Action', 'Publisher', $day($releaseOffset), '<svg/>']);
            $stats->execute([$id, $units, $units]);
            foreach ($offers as $i => [$price, $keyStatus, $active, $dealData]) {
                $offerId++;
                $offer->execute([$offerId, $id, ($i % 2) + 1, $price, $active]);
                $key->execute([$offerId, hash('sha256', "k$offerId"), $keyStatus]);
                if ($dealData !== null) {
                    $deal->execute([$offerId, $dealData[0], $dealData[1], $dealData[2]]);
                }
            }
        }

        self::$pdo->exec("INSERT INTO banners (id, slug, title, subtitle, cta_label, href, image_svg, position, active) VALUES
            (1,'first','First','First sub','Go','/store?sort=popular','<svg/>',2,1),
            (2,'second','Second','Second sub','Shop','/store?sort=newest','<svg/>',1,1),
            (3,'hidden','Hidden','Hidden sub','No','/x','<svg/>',0,0)");
        self::$pdo->exec("INSERT INTO home_blocks (slug, type, title, endpoint, position, enabled, config) VALUES
            ('banner','hero','Featured','/api/home/banners',1,1,'{\"autoplayMs\":6000}'),
            ('best_sellers','carousel','Best sellers','/api/home/best-sellers',2,1,'{\"limit\":10}'),
            ('deals','carousel','Hot deals','/api/home/deals',3,1,'{\"limit\":10}'),
            ('new_releases','carousel','New releases','/api/home/new-releases',4,1,'{\"limit\":10}')");
    }
}
