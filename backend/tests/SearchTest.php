<?php

declare(strict_types=1);

namespace Tests;

use App\Repositories\SearchRepository;
use App\Search\TextNormalizer;
use App\Services\SearchService;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Search through the real HTTP stack against a small catalog. Product 13 ("Hollow Knight: Silksong") and
 * product 24 ("Silksong Racing Legends 9") have no buyable offer: they must still be found, flagged out of stock.
 */
final class SearchTest extends DbTestCase
{
    private const WITCHER = 'The Witcher 3: Wild Hunt';
    private const CYBERPUNK = 'Cyberpunk 2077';
    private const CYBER_NEXUS = 'Cyber Nexus Arena';
    private const ELDEN = 'Elden Ring';
    private const CAFE = 'Café Tycoon';
    private const SILKSONG = 'Hollow Knight: Silksong';

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildFixture();
    }

    // ---- the query -> result table ---------------------------------------------------------

    /** @param list<string> $names */
    #[DataProvider('queryCases')]
    public function testQueryTable(string $query, string $kind, array $names): void
    {
        $items = $this->search($query)['items'];
        $found = array_column($items, 'name');

        match ($kind) {
            'first' => self::assertSame($names[0], $found[0] ?? null, "top result for '$query' (got: " . implode(' | ', $found) . ')'),
            'contains' => self::assertSame([], array_values(array_diff($names, $found)), "'$query' must include all of: " . implode(' | ', $names)),
            'only' => self::assertSame($names, $found, "'$query' must return exactly this list"),
            'empty' => self::assertSame([], $found, "'$query' must find nothing (got: " . implode(' | ', $found) . ')'),
        };
    }

    /** @return array<string, array{string, string, list<string>}> */
    public static function queryCases(): array
    {
        return [
            // exact and partial names
            'exact title' => ['The Witcher 3: Wild Hunt', 'first', [self::WITCHER]],
            'without the article' => ['witcher 3', 'first', [self::WITCHER]],
            'single word of the title' => ['witcher', 'first', [self::WITCHER]],
            'partial word "cyber"' => ['cyber', 'contains', [self::CYBERPUNK, self::CYBER_NEXUS]],
            'partial word "cyb"' => ['cyb', 'contains', [self::CYBERPUNK, self::CYBER_NEXUS]],
            'two full words from the middle' => ['wild hunt', 'first', [self::WITCHER]],
            // typos
            'typo "wither 3" (from the brief)' => ['wither 3', 'only', [self::WITCHER]],
            'typo "the wicher 3"' => ['the wicher 3', 'first', [self::WITCHER]],
            'transposition "cyberpnuk"' => ['cyberpnuk', 'first', [self::CYBERPUNK]],
            'missing letter "minecrft"' => ['minecrft', 'first', ['Minecraft: Java & Bedrock Edition']],
            'wrong letter "red dead redemtion"' => ['red dead redemtion', 'first', ['Red Dead Redemption 2']],
            'typo in a long word "stormhavn"' => ['stormhavn', 'first', ['Tides of Stormhaven']],
            // word order, spacing, case, punctuation, diacritics
            'word order "ring elden"' => ['ring elden', 'first', [self::ELDEN]],
            'order "hunt wild witcher"' => ['hunt wild witcher', 'first', [self::WITCHER]],
            'split compound "cyber punk 2077"' => ['cyber punk 2077', 'first', [self::CYBERPUNK]],
            'case and punctuation "ELDEN-RING!!"' => ['ELDEN-RING!!', 'first', [self::ELDEN]],
            'hyphen in the title' => ['counter strike', 'first', ['Counter-Strike 2']],
            'apostrophe in the title' => ['assassins creed', 'first', ["Assassin's Creed Valhalla"]],
            'diacritics in the title' => ['cafe tycoon', 'first', [self::CAFE]],
            'diacritics in the query' => ['CAFÉ', 'first', [self::CAFE]],
            'several matches' => ['tomb raider', 'contains', ['Tomb Raider Legacy', 'Rise of the Tomb Raider']],
            // out of stock is searchable
            'out-of-stock product is found' => ['silksong', 'contains', [self::SILKSONG]],
            // nothing similar
            'nonsense' => ['zzzzz', 'empty', []],
            'nonsense words' => ['xqzv wkjh', 'empty', []],
            'unknown game' => ['grand theft', 'empty', []],
            'sql injection attempt' => ["'; DROP TABLE products;--", 'empty', []],
            'LIKE wildcard %' => ['%', 'empty', []],
            'LIKE wildcard _' => ['_', 'empty', []],
            'only symbols' => ['!!! ???', 'empty', []],
        ];
    }

    public function testInjectionAttemptDidNotTouchTheTable(): void
    {
        $this->search("'; DROP TABLE products;--");

        self::assertSame(25, (int) self::$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn());
    }

    // ---- scores and ordering ---------------------------------------------------------------

    public function testResultsCarryAScoreAndAreSortedBestFirst(): void
    {
        $items = $this->search('cyber')['items'];

        self::assertGreaterThanOrEqual(2, count($items));
        $scores = array_column($items, 'score');
        foreach ($scores as $score) {
            self::assertIsFloat($score);
            self::assertGreaterThanOrEqual(SearchService::MIN_SCORE, $score);
            self::assertLessThanOrEqual(1.0, $score);
        }
        $sorted = $scores;
        rsort($sorted);
        self::assertSame($sorted, $scores, 'relevance order is score descending');
    }

    public function testRightWordOrderOutranksReversedOrder(): void
    {
        $exact = $this->search('elden ring')['items'][0]['score'];
        $reversed = $this->search('ring elden')['items'][0]['score'];

        self::assertGreaterThan($reversed, $exact);
    }

    public function testASharedNumberAloneIsNotAMatch(): void
    {
        $names = array_column($this->search('wither 3')['items'], 'name');

        self::assertNotContains('The Last Odyssey 3', $names);
    }

    // ---- out of stock ----------------------------------------------------------------------

    public function testOutOfStockProductsAreListedWhenSearchingButFlagged(): void
    {
        $silksong = $this->search('hollow knight')['items'][0];

        self::assertSame(self::SILKSONG, $silksong['name']);
        self::assertFalse($silksong['inStock']);
        self::assertNull($silksong['fromPriceCents']);
        self::assertSame(0, $silksong['offerCount']);
        self::assertArrayNotHasKey('discountPct', $silksong);

        $cyberpunk = $this->search('cyberpunk')['items'][0];
        self::assertTrue($cyberpunk['inStock']);
        self::assertIsInt($cyberpunk['fromPriceCents']);
    }

    public function testBrowsingWithoutAQueryStillHidesOutOfStockProducts(): void
    {
        $names = array_column($this->get('/api/products?pageSize=48')['items'], 'name');

        self::assertNotContains(self::SILKSONG, $names);
        self::assertContains(self::WITCHER, $names);
    }

    public function testOutOfStockResultsSortLastWhenSortingByPrice(): void
    {
        foreach (['price_asc', 'price_desc'] as $sort) {
            $items = $this->get('/api/products?q=racing+legends&sort=' . $sort . '&pageSize=48')['items'];

            self::assertCount(9, $items);
            self::assertFalse(end($items)['inStock'], "$sort: the out-of-stock match comes last");
            $prices = array_column(array_slice($items, 0, 8), 'fromPriceCents');
            $expected = $prices;
            $sort === 'price_asc' ? sort($expected) : rsort($expected);
            self::assertSame($expected, $prices);
        }
    }

    public function testAPriceFilterExcludesOutOfStockProducts(): void
    {
        self::assertSame(0, $this->get('/api/products?q=hollow+knight&price_max=999999')['total']);
        self::assertSame(1, $this->get('/api/products?q=hollow+knight')['total']);
    }

    // ---- q on /api/products (relevance sorting) --------------------------------------------

    public function testProductsEndpointWithQueryDefaultsToRelevanceAndMatchesSearchEndpoint(): void
    {
        $viaProducts = $this->get('/api/products?q=cyber');
        $viaSearch = $this->get('/api/search?q=cyber');

        self::assertSame($viaSearch, $viaProducts);
        self::assertArrayHasKey('score', $viaProducts['items'][0]);
        self::assertSame($viaProducts['items'], $this->get('/api/products?q=cyber&sort=relevance')['items']);
    }

    public function testOtherSortsStillApplyToSearchResults(): void
    {
        $byPrice = array_column($this->get('/api/products?q=cyber&sort=price_asc')['items'], 'name');

        self::assertSame([self::CYBERPUNK, self::CYBER_NEXUS], $byPrice, 'Cyberpunk (1000) is cheaper than Cyber Nexus (1030)');
        self::assertSame([self::CYBER_NEXUS, self::CYBERPUNK], array_column($this->get('/api/products?q=cyber&sort=price_desc')['items'], 'name'));
    }

    public function testFiltersNarrowSearchResults(): void
    {
        self::assertSame([self::CYBER_NEXUS], array_column($this->get('/api/products?q=cyber&platform[]=playstation')['items'], 'name'));
        self::assertSame([self::CYBERPUNK], array_column($this->get('/api/search?q=cyber&platform=steam')['items'], 'name'));
        self::assertSame(0, $this->get('/api/search?q=cyber&platform=xbox')['total']);
    }

    public function testPaginationOverSearchResults(): void
    {
        $seen = [];
        foreach ([1, 2, 3] as $page) {
            $body = $this->get("/api/search?q=racing+legends&pageSize=3&page=$page");
            self::assertSame(9, $body['total']);
            self::assertCount(3, $body['items']);
            array_push($seen, ...array_column($body['items'], 'slug'));
        }
        self::assertCount(9, array_unique($seen), 'no duplicates and no gaps across pages');
        self::assertSame([], $this->get('/api/search?q=racing+legends&pageSize=3&page=4')['items']);
    }

    public function testFiltersEndpointCountsSearchResults(): void
    {
        $body = $this->get('/api/filters?q=cyber');

        self::assertSame([['playstation', 1], ['steam', 1]], array_map(static fn (array $o): array => [$o['value'], $o['count']], $body['platforms']));
        self::assertSame(['min' => 1000, 'max' => 1030], $body['price']);
    }

    // ---- validation ------------------------------------------------------------------------

    /** @return array<string, array{string}> */
    public static function badSearchRequests(): array
    {
        return [
            'search without q' => ['/api/search'],
            'search with empty q' => ['/api/search?q='],
            'search with blank q' => ['/api/search?q=%20%20%20'],
            'q too long (101 chars)' => ['/api/search?q=' . str_repeat('a', 101)],
            'q as array' => ['/api/search?q[]=cyber'],
            'relevance without q' => ['/api/products?sort=relevance'],
        ];
    }

    #[DataProvider('badSearchRequests')]
    public function testInvalidSearchRequestsAre422(string $path): void
    {
        $response = $this->send('GET', $path);

        self::assertSame(422, $response->getStatusCode(), $path);
        self::assertSame('validation_failed', $this->json($response)['error']['code']);
    }

    // ---- suggest ---------------------------------------------------------------------------

    public function testSuggestReturnsTheBestSixInTheDocumentedShape(): void
    {
        $body = $this->get('/api/search/suggest?q=racing');

        self::assertSame(['suggestions'], array_keys($body));
        self::assertCount(6, $body['suggestions'], 'top 6 even though 9 products match');
        self::assertSame(['slug', 'name', 'coverUrl', 'platform', 'inStock', 'score'], array_keys($body['suggestions'][0]));
        self::assertSame('/api/images/products/' . $body['suggestions'][0]['slug'] . '.svg', $body['suggestions'][0]['coverUrl']);
        self::assertSame(['slug' => 'steam', 'name' => 'Steam'], $body['suggestions'][0]['platform']);
        $scores = array_column($body['suggestions'], 'score');
        $sorted = $scores;
        rsort($sorted);
        self::assertSame($sorted, $scores);
    }

    public function testSuggestFindsPartialAndMisspelledNamesAndFlagsOutOfStock(): void
    {
        self::assertEqualsCanonicalizing([self::CYBERPUNK, self::CYBER_NEXUS], array_column($this->get('/api/search/suggest?q=cyb')['suggestions'], 'name'));
        self::assertSame(self::WITCHER, $this->get('/api/search/suggest?q=wither+3')['suggestions'][0]['name']);

        $silksong = $this->get('/api/search/suggest?q=hollow+kn')['suggestions'][0];
        self::assertSame(self::SILKSONG, $silksong['name']);
        self::assertFalse($silksong['inStock']);
    }

    public function testSuggestIsEmptyForShortOrMissingQueries(): void
    {
        foreach (['/api/search/suggest', '/api/search/suggest?q=', '/api/search/suggest?q=c', '/api/search/suggest?q=%20c%20', '/api/search/suggest?q=zzzzz'] as $path) {
            self::assertSame(['suggestions' => []], $this->get($path), $path);
        }
        self::assertSame(422, $this->send('GET', '/api/search/suggest?q=' . str_repeat('a', 101))->getStatusCode());
    }

    // ---- candidate cap ---------------------------------------------------------------------

    public function testCandidateRetrievalIsCappedAndKeepsTheBestHitsFirst(): void
    {
        $repo = new SearchRepository(self::$pdo);

        $capped = $repo->candidates(TextNormalizer::normalize('racing legends'), 4);
        $all = $repo->candidates(TextNormalizer::normalize('racing legends'));

        self::assertCount(4, $capped);
        self::assertGreaterThanOrEqual(9, count($all));
        self::assertLessThanOrEqual(SearchRepository::MAX_CANDIDATES, count($all));
        self::assertSame(array_slice(array_column($all, 'id'), 0, 4), array_column($capped, 'id'), 'the cap keeps the top of the same ordering');
        foreach ($capped as $row) {
            self::assertStringContainsString('racing legends', $row['name_norm'], 'phrase matches outrank fuzzy ones');
        }
        self::assertSame([], $repo->candidates(''));
    }

    public function testRankingNeverReturnsMoreThanTheCandidateCap(): void
    {
        $service = new SearchService(new SearchRepository(self::$pdo), candidateCap: 3);

        self::assertCount(3, $service->rank('racing legends'));
    }

    // ---- helpers & fixture -----------------------------------------------------------------

    /** @return array<string, mixed> */
    private function get(string $path): array
    {
        $response = $this->send('GET', $path);
        self::assertSame(200, $response->getStatusCode(), $path . ' => ' . $response->getBody());

        return $this->json($response);
    }

    /** @return array<string, mixed> */
    private function search(string $query): array
    {
        return $this->get('/api/search?q=' . rawurlencode($query));
    }

    private function buildFixture(): void
    {
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['game_keys', 'deals', 'product_stats', 'offers', 'products', 'sellers', 'regions', 'platforms'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        self::$pdo->exec("INSERT INTO platforms (id, slug, name) VALUES (1,'steam','Steam'),(2,'playstation','PlayStation')");
        self::$pdo->exec("INSERT INTO regions (id, slug, name) VALUES (1,'global','Global')");
        self::$pdo->exec("INSERT INTO sellers (id, name, rating) VALUES (1,'Seller One',4.5)");

        // id => [name, platform id, buyable?]; ids 16-23 are the "Racing Legends" series, 24 is the out-of-stock one
        $products = [
            1 => ['The Witcher 3: Wild Hunt', 1, true], 2 => ['Cyberpunk 2077', 1, true], 3 => ['Cyber Nexus Arena', 2, true],
            4 => ['Elden Ring', 1, true], 5 => ['FIFA 24', 2, true], 6 => ['Counter-Strike 2', 1, true],
            7 => ["Assassin's Creed Valhalla", 1, true], 8 => ['Café Tycoon', 1, true], 9 => ['Red Dead Redemption 2', 1, true],
            10 => ['Tomb Raider Legacy', 1, true], 11 => ['Rise of the Tomb Raider', 1, true],
            12 => ['Minecraft: Java & Bedrock Edition', 1, true], 13 => ['Hollow Knight: Silksong', 1, false],
            14 => ['Tides of Stormhaven', 1, true], 15 => ['The Last Odyssey 3', 1, true],
        ];
        for ($i = 1; $i <= 8; $i++) {
            $products[15 + $i] = ["Racing Legends $i", 1, true];
        }
        $products[24] = ['Silksong Racing Legends 9', 1, false];
        $products[25] = ['Plain Filler Title', 1, true];

        $insertProduct = self::$pdo->prepare('INSERT INTO products (id, slug, name, name_norm, description, genre, publisher, release_date, platform_id, region_id, cover_svg) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $insertOffer = self::$pdo->prepare('INSERT INTO offers (id, product_id, seller_id, price_cents, active) VALUES (?,?,1,?,1)');
        $insertKey = self::$pdo->prepare("INSERT INTO game_keys (offer_id, key_enc, key_hash, status) VALUES (?, 'enc', ?, ?)");
        $insertStats = self::$pdo->prepare('INSERT INTO product_stats (product_id, units_sold, view_count, popularity) VALUES (?,?,0,?)');
        foreach ($products as $id => [$name, $platform, $buyable]) {
            $slug = trim(preg_replace('/[^a-z0-9]+/', '-', TextNormalizer::normalize($name)), '-');
            $insertProduct->execute([$id, $slug, $name, TextNormalizer::normalize($name), "$name description", 'Action', 'Test Publisher', '2024-01-01', $platform, 1, '<svg/>']);
            $insertStats->execute([$id, 100 - $id, 100 - $id]);
            // buyable products get an available key; the others only a sold one (so the offer exists but cannot be bought)
            $insertOffer->execute([$id, $id, 1000 + ($id === 3 ? 30 : 0) + ($id > 15 ? $id : 0)]);
            $insertKey->execute([$id, hash('sha256', "k$id"), $buyable ? 'available' : 'sold']);
        }
    }
}
