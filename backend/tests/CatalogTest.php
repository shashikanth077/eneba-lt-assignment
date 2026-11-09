<?php

declare(strict_types=1);

namespace Tests;

use App\Catalog\ProductFilters;
use App\Catalog\ProductSort;
use App\Repositories\ProductRepository;
use PDO;
use PDOStatement;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Catalog endpoints against a tiny hand-built dataset, so every expectation can be checked by eye.
 *
 * Products (platform / region / genre / release / popularity):
 *   A alpha    steam  global  Action   2026-01-10  100   offers: 1000 (3 keys, deal 2000 -50%) | 1200 (2) | 900 (0 keys = not buyable)
 *   B bravo    steam  europe  RPG      2025-06-01  500   offers: 3000 (1) | 2500 (5)
 *   C charlie  psn    global  Action   2024-03-15  300   offers: 1500 (4, deal 1800 -17%) | 1400 (3, no deal)
 *   D delta    psn    europe  Strategy 2026-05-20   50   offers: 5000 (10)
 *   E echo     steam  global  Puzzle   2023-02-02  400   offers: 500 | 700 | 800 (1 key each)
 *   F foxtrot  steam  global  Action   (all keys sold)      G golf  steam  global  Action  (offer inactive)
 * F and G exist but have nothing buyable, so they are not in the catalog list. Xbox has no products.
 */
final class CatalogTest extends DbTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->buildFixture();
    }

    // ---- list: shape -----------------------------------------------------------------------

    public function testListReturnsTheDocumentedShape(): void
    {
        $body = $this->get('/api/products?sort=price_asc');

        self::assertSame(['items', 'page', 'pageSize', 'total'], array_keys($body));
        self::assertSame(1, $body['page']);
        self::assertSame(24, $body['pageSize']);
        self::assertSame(5, $body['total']);

        $echo = $body['items'][0];
        self::assertSame(
            ['id', 'slug', 'name', 'coverUrl', 'platform', 'region', 'fromPriceCents', 'offerCount'],
            array_keys($echo),
            'no discountPct key when the cheapest offer has no deal',
        );
        self::assertSame('echo-steam-global', $echo['slug']);
        self::assertSame('/api/images/products/echo-steam-global.svg', $echo['coverUrl']);
        self::assertSame(['slug' => 'steam', 'name' => 'Steam'], $echo['platform']);
        self::assertSame(['slug' => 'global', 'name' => 'Global'], $echo['region']);
        self::assertSame(500, $echo['fromPriceCents']);
        self::assertSame(3, $echo['offerCount']);
    }

    public function testFromPriceAndOfferCountIgnoreOffersWithoutKeysAndInactiveOnes(): void
    {
        $alpha = $this->bySlug($this->get('/api/products')['items'], 'alpha-steam-global');

        self::assertSame(1000, $alpha['fromPriceCents'], 'the 900 offer has no keys left');
        self::assertSame(2, $alpha['offerCount']);
        self::assertSame(50, $alpha['discountPct']);
        self::assertSame([], $this->slugs($this->get('/api/products?pageSize=48')['items'], ['foxtrot-sold-out', 'golf-inactive']), 'sold out / inactive products are not listed');
    }

    public function testDiscountIsTheDealOfTheCheapestOfferOnly(): void
    {
        $charlie = $this->bySlug($this->get('/api/products')['items'], 'charlie-playstation-global');

        self::assertSame(1400, $charlie['fromPriceCents']);
        self::assertArrayNotHasKey('discountPct', $charlie, 'the -17% deal is on a pricier offer');
    }

    // ---- list: filters ---------------------------------------------------------------------

    #[DataProvider('filterCases')]
    public function testFilters(string $query, array $expectedSlugs): void
    {
        $body = $this->get('/api/products?sort=price_asc&' . $query);

        self::assertSame($expectedSlugs, array_column($body['items'], 'slug'));
        self::assertSame(count($expectedSlugs), $body['total']);
    }

    /** @return array<string, array{string, list<string>}> sorted by from price: E 500, A 1000, C 1400, B 2500, D 5000 */
    public static function filterCases(): array
    {
        return [
            'platform single' => ['platform=steam', ['echo-steam-global', 'alpha-steam-global', 'bravo-steam-europe']],
            'platform array' => ['platform[]=steam&platform[]=playstation', ['echo-steam-global', 'alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe', 'delta-playstation-europe']],
            'platform without products' => ['platform[]=xbox', []],
            'platform unknown slug' => ['platform[]=nope', []],
            'region' => ['region[]=europe', ['bravo-steam-europe', 'delta-playstation-europe']],
            'regions array' => ['region[]=europe&region[]=global', ['echo-steam-global', 'alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe', 'delta-playstation-europe']],
            'genre' => ['genre=Action', ['alpha-steam-global', 'charlie-playstation-global']],
            'genre array' => ['genre[]=Action&genre[]=RPG', ['alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe']],
            'price_min' => ['price_min=1000', ['alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe', 'delta-playstation-europe']],
            'price_min is inclusive' => ['price_min=500', ['echo-steam-global', 'alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe', 'delta-playstation-europe']],
            'price_max' => ['price_max=1400', ['echo-steam-global', 'alpha-steam-global', 'charlie-playstation-global']],
            'price range' => ['price_min=1000&price_max=2500', ['alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe']],
            'price range with no match' => ['price_min=1&price_max=499', []],
            'combined platform+genre' => ['platform[]=steam&genre[]=Action', ['alpha-steam-global']],
            'combined all' => ['platform[]=steam&region[]=global&genre[]=Puzzle&price_max=600', ['echo-steam-global']],
            'empty values are ignored' => ['platform[]=&genre=', ['echo-steam-global', 'alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe', 'delta-playstation-europe']],
        ];
    }

    // ---- list: sorts -----------------------------------------------------------------------

    #[DataProvider('sortCases')]
    public function testSorts(string $sort, array $expectedSlugs): void
    {
        self::assertSame($expectedSlugs, array_column($this->get('/api/products?sort=' . $sort)['items'], 'slug'));
    }

    /** @return array<string, array{string, list<string>}> */
    public static function sortCases(): array
    {
        return [
            'price_asc' => ['price_asc', ['echo-steam-global', 'alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe', 'delta-playstation-europe']],
            'price_desc' => ['price_desc', ['delta-playstation-europe', 'bravo-steam-europe', 'charlie-playstation-global', 'alpha-steam-global', 'echo-steam-global']],
            'popular' => ['popular', ['bravo-steam-europe', 'echo-steam-global', 'charlie-playstation-global', 'alpha-steam-global', 'delta-playstation-europe']],
            'newest' => ['newest', ['delta-playstation-europe', 'alpha-steam-global', 'bravo-steam-europe', 'charlie-playstation-global', 'echo-steam-global']],
            // alpha has the only deal on its cheapest offer; the rest tie at 0% and fall back to popularity
            'discount' => ['discount', ['alpha-steam-global', 'bravo-steam-europe', 'echo-steam-global', 'charlie-playstation-global', 'delta-playstation-europe']],
        ];
    }

    public function testDefaultSortIsPopular(): void
    {
        self::assertSame(
            array_column($this->get('/api/products?sort=popular')['items'], 'slug'),
            array_column($this->get('/api/products')['items'], 'slug'),
        );
    }

    // ---- list: pagination ------------------------------------------------------------------

    public function testPaginationWalksEveryProductExactlyOnce(): void
    {
        $seen = [];
        foreach ([1, 2, 3] as $page) {
            $body = $this->get("/api/products?sort=price_asc&pageSize=2&page=$page");
            self::assertSame($page, $body['page']);
            self::assertSame(2, $body['pageSize']);
            self::assertSame(5, $body['total'], 'total ignores paging');
            array_push($seen, ...array_column($body['items'], 'slug'));
        }

        self::assertSame(
            ['echo-steam-global', 'alpha-steam-global', 'charlie-playstation-global', 'bravo-steam-europe', 'delta-playstation-europe'],
            $seen,
        );
    }

    public function testPaginationEdges(): void
    {
        $lastPage = $this->get('/api/products?sort=price_asc&pageSize=2&page=3');
        self::assertCount(1, $lastPage['items'], 'partial last page');

        $past = $this->get('/api/products?sort=price_asc&pageSize=2&page=4');
        self::assertSame([], $past['items'], 'a page past the end is empty, not an error');
        self::assertSame(5, $past['total']);

        self::assertCount(5, $this->get('/api/products?pageSize=5')['items'], 'pageSize == total');
        self::assertCount(5, $this->get('/api/products?pageSize=48')['items'], 'pageSize larger than total');
        self::assertCount(1, $this->get('/api/products?pageSize=1')['items'], 'smallest page size');
        self::assertSame(2, $this->get('/api/products?filter=x&platform=steam&price_max=500&pageSize=48&page=1')['total'] + 1, 'unknown params are ignored');
    }

    #[DataProvider('invalidListQueries')]
    public function testInvalidListQueriesAreRejectedWith422(string $query, string $field): void
    {
        $response = $this->send('GET', '/api/products?' . $query);

        self::assertSame(422, $response->getStatusCode());
        $error = $this->json($response)['error'];
        self::assertSame('validation_failed', $error['code']);
        self::assertArrayHasKey($field, $error['details']['fields']);
    }

    /** @return array<string, array{string, string}> */
    public static function invalidListQueries(): array
    {
        return [
            'page 0' => ['page=0', 'page'],
            'negative page' => ['page=-1', 'page'],
            'page not a number' => ['page=abc', 'page'],
            'pageSize 0' => ['pageSize=0', 'pageSize'],
            'pageSize over the cap' => ['pageSize=49', 'pageSize'],
            'unknown sort' => ['sort=cheapest', 'sort'],
            'sort as array' => ['sort[]=price_asc', 'sort'],
            'price_min not a number' => ['price_min=ten', 'price_min'],
            'negative price' => ['price_max=-5', 'price_max'],
            'min greater than max' => ['price_min=900&price_max=100', 'price_min'],
            'filter value with SQL-ish junk' => ["platform[]=steam'%20OR%201=1", 'platform'],
            'too many filter values' => [implode('&', array_map(static fn (int $i): string => "genre[]=g$i", range(1, 21))), 'genre'],
        ];
    }

    public function testFilterValuesAreNeverInterpolatedIntoSql(): void
    {
        // Passes validation (letters/digits/space) and must simply match nothing, not break the query.
        $body = $this->get("/api/products?genre=Action%20OR%201%201");

        self::assertSame(0, $body['total']);
    }

    // ---- filters (facets) ------------------------------------------------------------------

    public function testFiltersListAvailableOptionsWithCounts(): void
    {
        $body = $this->get('/api/filters');

        self::assertSame(['platforms', 'regions', 'genres', 'price'], array_keys($body));
        self::assertSame(
            [['value' => 'playstation', 'label' => 'PlayStation', 'count' => 2], ['value' => 'steam', 'label' => 'Steam', 'count' => 3]],
            $body['platforms'],
            'Xbox has no products so it is not offered',
        );
        self::assertSame(
            [['value' => 'europe', 'label' => 'Europe', 'count' => 2], ['value' => 'global', 'label' => 'Global', 'count' => 3]],
            $body['regions'],
        );
        self::assertSame(
            [
                ['value' => 'Action', 'label' => 'Action', 'count' => 2], ['value' => 'Puzzle', 'label' => 'Puzzle', 'count' => 1],
                ['value' => 'RPG', 'label' => 'RPG', 'count' => 1], ['value' => 'Strategy', 'label' => 'Strategy', 'count' => 1],
            ],
            $body['genres'],
        );
        self::assertSame(['min' => 500, 'max' => 5000], $body['price']);
    }

    public function testFacetCountsReflectTheOtherFiltersButNotTheirOwn(): void
    {
        $body = $this->get('/api/filters?platform[]=steam');

        // platforms: own filter ignored, so PlayStation is still countable next to the selected Steam
        self::assertSame([['playstation', 2], ['steam', 3]], $this->pairs($body['platforms']));
        // regions/genres/price: only Steam products (A global, B europe, E global)
        self::assertSame([['europe', 1], ['global', 2]], $this->pairs($body['regions']));
        self::assertSame([['Action', 1], ['Puzzle', 1], ['RPG', 1]], $this->pairs($body['genres']));
        self::assertSame(['min' => 500, 'max' => 2500], $body['price']);
    }

    public function testPriceFacetIgnoresThePriceFilterButRespectsTheRest(): void
    {
        $body = $this->get('/api/filters?price_min=2000&genre[]=Action');

        self::assertSame(['min' => 1000, 'max' => 1400], $body['price'], 'Action products only, price filter not applied to itself');
        self::assertSame([], $body['platforms'], 'Action + from price >= 2000 matches nothing, and zero-count options are dropped');
    }

    public function testSelectedOptionsStayVisibleWithZeroCount(): void
    {
        $body = $this->get('/api/filters?platform[]=xbox&genre[]=Horror');

        self::assertContains(['xbox', 0], $this->pairs($body['platforms']));
        self::assertContains(['Horror', 0], $this->pairs($body['genres']), 'a selected genre without matches is kept so it can be unticked');
        self::assertSame(['min' => null, 'max' => null], $this->get('/api/filters?platform[]=xbox')['price']);
    }

    public function testFiltersRejectInvalidInput(): void
    {
        self::assertSame(422, $this->send('GET', '/api/filters?price_min=abc')->getStatusCode());
    }

    // ---- product detail --------------------------------------------------------------------

    public function testProductDetailShapeAndOffers(): void
    {
        $body = $this->get('/api/products/alpha-steam-global');

        self::assertSame(['product', 'offers'], array_keys($body));
        $product = $body['product'];
        self::assertSame(
            ['id', 'slug', 'name', 'coverUrl', 'platform', 'region', 'fromPriceCents', 'offerCount', 'discountPct', 'description', 'releaseDate', 'genres', 'publisher'],
            array_keys($product),
        );
        self::assertSame('Alpha', $product['name']);
        self::assertSame('2026-01-10', $product['releaseDate']);
        self::assertSame(['Action'], $product['genres']);
        self::assertSame(['slug' => 'global', 'name' => 'Global'], $product['region']);
        self::assertSame(1000, $product['fromPriceCents']);
        self::assertSame(2, $product['offerCount']);

        self::assertSame(
            [
                [
                    'id' => $body['offers'][0]['id'],
                    'seller' => ['id' => $body['offers'][0]['seller']['id'], 'name' => 'Seller One', 'rating' => 4.5],
                    'priceCents' => 1000,
                    'originalPriceCents' => 2000,
                    'stock' => 3,
                    'deliveryType' => 'instant',
                ],
                [
                    'id' => $body['offers'][1]['id'],
                    'seller' => ['id' => $body['offers'][1]['seller']['id'], 'name' => 'Seller Two', 'rating' => 4],
                    'priceCents' => 1200,
                    'stock' => 2,
                    'deliveryType' => 'instant',
                ],
            ],
            $body['offers'],
            'cheapest first; the 900 offer without keys is hidden; originalPriceCents only on deals',
        );
    }

    public function testOffersAreSortedByPriceAndStockCountsOnlyAvailableKeys(): void
    {
        self::$pdo->exec("UPDATE game_keys SET status = 'sold' WHERE id = (SELECT id FROM (SELECT MIN(k.id) id FROM game_keys k JOIN offers o ON o.id = k.offer_id JOIN products p ON p.id = o.product_id WHERE p.slug = 'bravo-steam-europe' AND o.price_cents = 2500) t)");

        $offers = $this->get('/api/products/bravo-steam-europe')['offers'];

        self::assertSame([2500, 3000], array_column($offers, 'priceCents'));
        self::assertSame([4, 1], array_column($offers, 'stock'), 'a sold key no longer counts');
    }

    public function testProductWithNothingBuyableStillHasAPage(): void
    {
        foreach (['foxtrot-sold-out', 'golf-inactive'] as $slug) {
            $body = $this->get("/api/products/$slug");

            self::assertSame([], $body['offers']);
            self::assertNull($body['product']['fromPriceCents']);
            self::assertSame(0, $body['product']['offerCount']);
            self::assertArrayNotHasKey('discountPct', $body['product']);
        }
    }

    public function testUnknownSlugIs404InTheErrorFormat(): void
    {
        $response = $this->send('GET', '/api/products/does-not-exist');

        self::assertSame(404, $response->getStatusCode());
        self::assertSame(['error' => ['code' => 'not_found', 'message' => 'Product not found', 'details' => null]], $this->json($response));
    }

    // ---- no N+1 ----------------------------------------------------------------------------

    public function testStatementCountDoesNotGrowWithTheNumberOfRows(): void
    {
        $pdo = new class (self::$pdo) extends PDO {
            public int $statements = 0;

            public function __construct(PDO $source)
            {
                parent::__construct(
                    'mysql:host=' . ($_ENV['DB_HOST'] ?? '127.0.0.1') . ';port=' . ($_ENV['DB_PORT'] ?? '3306') . ';dbname=' . $_ENV['DB_NAME'] . ';charset=utf8mb4',
                    $_ENV['DB_USER'] ?? '',
                    $_ENV['DB_PASS'] ?? '',
                    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false],
                );
            }

            public function prepare(string $query, array $options = []): PDOStatement|false
            {
                $this->statements++;

                return parent::prepare($query, $options);
            }
        };
        $repo = new ProductRepository($pdo);
        $all = new ProductFilters();

        $repo->list($all, ProductSort::Popular, 1, 1);
        $oneRow = $pdo->statements;
        $pdo->statements = 0;
        $repo->list($all, ProductSort::Popular, 1, 48);
        $fiveRows = $pdo->statements;
        $pdo->statements = 0;
        $repo->facets($all);
        $facets = $pdo->statements;
        $pdo->statements = 0;
        $repo->offersFor((int) $repo->findBySlug('echo-steam-global')['id']);
        $offers = $pdo->statements;

        self::assertSame(2, $oneRow, 'list = rows + count');
        self::assertSame($oneRow, $fiveRows, 'same number of statements for 1 row or 5 rows');
        self::assertSame(4, $facets, 'facets = platforms + regions + genres + price');
        self::assertSame(2, $offers, 'product page = 1 statement for the product + 1 for all its offers');
    }

    // ---- fixture ---------------------------------------------------------------------------

    /** @return list<mixed> */
    private function row(string $sql, array $params = []): array
    {
        $stmt = self::$pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed> */
    private function get(string $path): array
    {
        $response = $this->send('GET', $path);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return $this->json($response);
    }

    /** @param list<array<string, mixed>> $items @return array<string, mixed> */
    private function bySlug(array $items, string $slug): array
    {
        foreach ($items as $item) {
            if ($item['slug'] === $slug) {
                return $item;
            }
        }
        self::fail("Product $slug is not in the list");
    }

    /**
     * @param list<array<string, mixed>> $items
     * @param list<string> $slugs
     * @return list<string> the given slugs that ARE present
     */
    private function slugs(array $items, array $slugs): array
    {
        return array_values(array_intersect($slugs, array_column($items, 'slug')));
    }

    /** @param list<array{value: string, count: int}> $options @return list<array{string, int}> */
    private function pairs(array $options): array
    {
        return array_map(static fn (array $o): array => [$o['value'], $o['count']], $options);
    }

    private function buildFixture(): void
    {
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['game_keys', 'deals', 'product_stats', 'offers', 'products', 'sellers', 'regions', 'platforms'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        self::$pdo->exec("INSERT INTO platforms (id, slug, name) VALUES (1,'steam','Steam'),(2,'playstation','PlayStation'),(3,'xbox','Xbox')");
        self::$pdo->exec("INSERT INTO regions (id, slug, name) VALUES (1,'global','Global'),(2,'europe','Europe'),(3,'united-states','United States')");
        self::$pdo->exec("INSERT INTO sellers (id, name, rating) VALUES (1,'Seller One',4.5),(2,'Seller Two',4.0),(3,'Seller Three',3.8)");

        // id, slug, name, genre, release, platform, region, popularity
        $products = [
            [1, 'alpha-steam-global', 'Alpha', 'Action', '2026-01-10', 1, 1, 100],
            [2, 'bravo-steam-europe', 'Bravo', 'RPG', '2025-06-01', 1, 2, 500],
            [3, 'charlie-playstation-global', 'Charlie', 'Action', '2024-03-15', 2, 1, 300],
            [4, 'delta-playstation-europe', 'Delta', 'Strategy', '2026-05-20', 2, 2, 50],
            [5, 'echo-steam-global', 'Echo', 'Puzzle', '2023-02-02', 1, 1, 400],
            [6, 'foxtrot-sold-out', 'Foxtrot', 'Action', '2022-01-01', 1, 1, 10],
            [7, 'golf-inactive', 'Golf', 'Action', '2022-01-02', 1, 1, 10],
        ];
        $insert = self::$pdo->prepare('INSERT INTO products (id, slug, name, name_norm, description, genre, publisher, release_date, platform_id, region_id, cover_svg) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $stats = self::$pdo->prepare('INSERT INTO product_stats (product_id, units_sold, view_count, popularity) VALUES (?,?,?,?)');
        foreach ($products as [$id, $slug, $name, $genre, $release, $platform, $region, $popularity]) {
            $insert->execute([$id, $slug, $name, strtolower($name), "$name description", $genre, 'Test Publisher', $release, $platform, $region, '<svg/>']);
            $stats->execute([$id, $popularity, 0, $popularity]);
        }

        // offer id, product, seller, price, keys, active, deal [original, pct]
        $offers = [
            [1, 1, 1, 1000, 3, 1, [2000, 50]], [2, 1, 2, 1200, 2, 1, null], [3, 1, 3, 900, 0, 1, null],
            [4, 2, 1, 3000, 1, 1, null], [5, 2, 2, 2500, 5, 1, null],
            [6, 3, 1, 1500, 4, 1, [1800, 17]], [7, 3, 2, 1400, 3, 1, null],
            [8, 4, 3, 5000, 10, 1, null],
            [9, 5, 1, 500, 1, 1, null], [10, 5, 2, 700, 1, 1, null], [11, 5, 3, 800, 1, 1, null],
            [12, 6, 1, 1000, 0, 1, null],
            [13, 7, 1, 1000, 2, 0, null],
        ];
        $offer = self::$pdo->prepare('INSERT INTO offers (id, product_id, seller_id, price_cents, active) VALUES (?,?,?,?,?)');
        $deal = self::$pdo->prepare('INSERT INTO deals (offer_id, original_price_cents, discount_pct) VALUES (?,?,?)');
        $key = self::$pdo->prepare('INSERT INTO game_keys (offer_id, key_enc, key_hash, status) VALUES (?,?,?,?)');
        $n = 0;
        foreach ($offers as [$id, $product, $seller, $price, $keys, $active, $dealData]) {
            $offer->execute([$id, $product, $seller, $price, $active]);
            if ($dealData !== null) {
                $deal->execute([$id, $dealData[0], $dealData[1]]);
            }
            for ($i = 0; $i < $keys; $i++) {
                $key->execute([$id, 'enc', hash('sha256', 'key' . ++$n), 'available']);
            }
        }
        // Foxtrot's only offer has keys, but they are all sold.
        $key->execute([12, 'enc', hash('sha256', 'sold-1'), 'sold']);
        $key->execute([12, 'enc', hash('sha256', 'sold-2'), 'reserved']);
    }
}
