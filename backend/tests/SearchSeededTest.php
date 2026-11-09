<?php

declare(strict_types=1);

namespace Tests;

use App\Support\KeyCipher;
use Database\Seeds\DatabaseSeeder;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Search against the real seeded catalog (120 generated titles), so the pipeline is also checked on data
 * it was not tuned on. Expectations come from the database itself, not from hard-coded titles.
 */
final class SearchSeededTest extends DbTestCase
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

    /** Every product title is searched by itself, mangled in different ways; the product itself must come out on top. */
    #[DataProvider('mangling')]
    public function testEveryTitleFindsItselfDespiteMangling(string $how, callable $mangle, float $minTopHitRate): void
    {
        $titles = self::$pdo->query('SELECT id, name FROM products ORDER BY id')->fetchAll();
        $hits = 0;
        $misses = [];
        foreach ($titles as $row) {
            $query = $mangle($row['name']);
            $top = $this->get('/api/search?pageSize=3&q=' . rawurlencode($query))['items'];
            // titles can repeat across platforms/regions, so "found" means: the top hit carries the same name
            if (($top[0]['name'] ?? null) === $row['name']) {
                $hits++;
            } else {
                $misses[] = $row['name'] . " <= '$query' => " . ($top[0]['name'] ?? 'nothing');
            }
        }
        $rate = $hits / count($titles);

        self::assertGreaterThanOrEqual($minTopHitRate, $rate, "$how: top-hit rate " . round($rate * 100, 1) . "%. Misses: " . implode('; ', array_slice($misses, 0, 8)));
    }

    /** @return array<string, array{string, callable, float}> */
    public static function mangling(): array
    {
        return [
            'exact title' => ['exact', static fn (string $t): string => $t, 1.0],
            'lower case, no punctuation' => ['normalised', static fn (string $t): string => strtoupper($t) . '!!', 1.0],
            'words reversed' => ['reversed', static fn (string $t): string => implode(' ', array_reverse(explode(' ', $t))), 0.95],
            'one letter dropped from the longest word' => ['typo-delete', static function (string $t): string {
                $words = explode(' ', $t);
                usort($words, static fn (string $a, string $b): int => strlen($b) <=> strlen($a));
                $long = $words[0];

                return str_replace($long, substr($long, 0, 2) . substr($long, 3), $t);
            }, 0.95],
            'two adjacent letters swapped' => ['typo-swap', static function (string $t): string {
                $pos = strlen($t) > 6 ? 3 : 1;

                return substr($t, 0, $pos) . $t[$pos + 1] . $t[$pos] . substr($t, $pos + 2);
            }, 0.95],
        ];
    }

    /**
     * A fragment such as "Tides" cannot single out one title when several start with it, so for partial names the
     * contract is recall: the intended title is among the results, and every top result really contains the fragment.
     */
    public function testPartialNamesKeepTheIntendedTitleInTheResults(): void
    {
        $titles = self::$pdo->query('SELECT name FROM products ORDER BY id')->fetchAll(\PDO::FETCH_COLUMN);
        $found = 0;
        foreach ($titles as $title) {
            $fragment = rtrim(substr($title, 0, 5));
            $names = array_column($this->get('/api/search?pageSize=48&q=' . rawurlencode($fragment))['items'], 'name');
            $found += in_array($title, $names, true) ? 1 : 0;
            self::assertStringStartsWith(strtolower($fragment), strtolower($names[0] ?? ''), "top result for '$fragment' starts with it");
        }

        self::assertGreaterThanOrEqual(0.97, $found / count($titles), "recall of partial names: $found / " . count($titles));
    }

    public function testPartialWordReturnsExactlyTheTitlesContainingIt(): void
    {
        $expected = self::$pdo->query("SELECT name FROM products WHERE name_norm LIKE '%crimson%' ORDER BY name")->fetchAll(\PDO::FETCH_COLUMN);
        self::assertNotEmpty($expected);

        $found = array_column($this->get('/api/search?q=crimson&pageSize=48')['items'], 'name');
        sort($found);

        self::assertSame($expected, $found);
    }

    public function testASeedTitleWithATypoAndReorderedWords(): void
    {
        $top = $this->get('/api/search?q=' . rawurlencode('forgoten drfit'))['items'][0];

        self::assertSame('Forgotten Drift', $top['name']);
    }

    public function testSuggestOnSeededDataStaysWithinSixAndRanksBest(): void
    {
        $suggestions = $this->get('/api/search/suggest?q=' . rawurlencode('storm'))['suggestions'];

        self::assertNotEmpty($suggestions);
        self::assertLessThanOrEqual(6, count($suggestions));
        foreach ($suggestions as $s) {
            self::assertStringContainsStringIgnoringCase('storm', $s['name']);
        }
    }

    public function testNonsenseFindsNothingOnSeededData(): void
    {
        foreach (['qqqqqq', 'zxcvbnm', '9999999'] as $q) {
            self::assertSame(0, $this->get('/api/search?q=' . $q)['total'], $q);
        }
    }

    /** @return array<string, mixed> */
    private function get(string $path): array
    {
        $response = $this->send('GET', $path);
        self::assertSame(200, $response->getStatusCode(), $path . ' => ' . $response->getBody());

        return $this->json($response);
    }
}
