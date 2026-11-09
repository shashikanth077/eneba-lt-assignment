<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Search\TextNormalizer;
use PDO;

/**
 * Candidate retrieval: a cheap, over-inclusive SQL pass so PHP only has to re-rank a bounded set.
 * Matches (all against products.name_norm, all with bound LIKE patterns):
 *   - the whole phrase as a substring                 "cyber nex"  -> "cyber nexus arena"
 *   - each word as a prefix of the title or of a word "cyb"        -> "cyberpunk", "neon cyber"
 *   - up to MAX_TRIGRAMS inner 3-letter pieces        "wither"     -> wit|ith|the|her -> "witcher"  (typos)
 * Candidates are ordered by how many patterns they hit, so the cap keeps the best ones, not arbitrary ones.
 */
final class SearchRepository
{
    public const MAX_CANDIDATES = 200;
    private const MAX_TOKENS = 8;
    private const MAX_TRIGRAMS = 12;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return list<array{id: int, name_norm: string, popularity: int}> at most $cap rows, best pattern-hits first
     */
    public function candidates(string $normalizedQuery, int $cap = self::MAX_CANDIDATES): array
    {
        $patterns = $this->patterns($normalizedQuery);
        if ($patterns === []) {
            return [];
        }

        $conditions = implode(' OR ', array_fill(0, count($patterns), 'p.name_norm LIKE ?'));
        $hits = implode(' + ', array_fill(0, count($patterns), '(p.name_norm LIKE ?)'));
        $sql = "SELECT p.id, p.name_norm, COALESCE(s.popularity, 0) AS popularity, ($hits) AS hits
                FROM products p
                LEFT JOIN product_stats s ON s.product_id = p.id
                WHERE $conditions
                ORDER BY hits DESC, popularity DESC, p.id ASC
                LIMIT ?";

        $stmt = $this->pdo->prepare($sql);
        $i = 1;
        foreach ([...$patterns, ...$patterns] as $pattern) {
            $stmt->bindValue($i++, $pattern, PDO::PARAM_STR);
        }
        $stmt->bindValue($i, $cap, PDO::PARAM_INT);
        $stmt->execute();

        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'name_norm' => (string) $r['name_norm'],
            'popularity' => (int) $r['popularity'],
        ], $stmt->fetchAll());
    }

    /**
     * Normalised text only contains [a-z0-9 ], so the patterns hold no LIKE wildcards of their own.
     *
     * @return list<string>
     */
    private function patterns(string $query): array
    {
        $tokens = array_slice(TextNormalizer::tokens($query), 0, self::MAX_TOKENS);
        if ($tokens === []) {
            return [];
        }

        $patterns = ['%' . implode(' ', $tokens) . '%'];
        foreach ($tokens as $token) {
            $patterns[] = $token . '%';       // title starts with it
            $patterns[] = '% ' . $token . '%'; // some word starts with it
        }
        foreach ($this->innerTrigrams($tokens) as $trigram) {
            $patterns[] = '%' . $trigram . '%';
        }

        return array_values(array_unique($patterns));
    }

    /**
     * Inner (unpadded) trigrams of every word with 3+ letters, spread evenly if there are more than MAX_TRIGRAMS.
     *
     * @param list<string> $tokens
     * @return list<string>
     */
    private function innerTrigrams(array $tokens): array
    {
        $all = [];
        foreach ($tokens as $token) {
            for ($i = 0, $n = strlen($token) - 2; $i < $n; $i++) {
                $all[substr($token, $i, 3)] = true;
            }
        }
        $all = array_keys($all);
        if (count($all) <= self::MAX_TRIGRAMS) {
            return $all;
        }
        $step = count($all) / self::MAX_TRIGRAMS;

        return array_map(static fn (int $i): string => $all[(int) floor($i * $step)], range(0, self::MAX_TRIGRAMS - 1));
    }
}
