<?php

declare(strict_types=1);

namespace App\Services;

use App\Repositories\SearchRepository;
use App\Search\Scorer;
use App\Search\TextNormalizer;

/**
 * normalise -> retrieve candidates (SQL, capped) -> re-rank in PHP -> keep what is similar enough.
 * Returns product ids with their score; building cards, filtering and paging is the catalog's job.
 */
final class SearchService
{
    /** Below this a candidate is noise ("wither 3" must not return every title that contains "the"). */
    public const MIN_SCORE = 0.40;
    public const SUGGEST_LIMIT = 6;
    public const SUGGEST_MIN_CHARS = 2;

    public function __construct(
        private readonly SearchRepository $candidates,
        private readonly int $candidateCap = SearchRepository::MAX_CANDIDATES,
    ) {
    }

    /**
     * @return array<int, float> product id => score (0..1), best first; empty when nothing is similar enough
     */
    public function rank(string $rawQuery): array
    {
        $query = TextNormalizer::normalize($rawQuery);
        if ($query === '') {
            return [];
        }

        $scored = [];
        foreach ($this->candidates->candidates($query, $this->candidateCap) as $candidate) {
            $score = Scorer::score($query, $candidate['name_norm']);
            if ($score >= self::MIN_SCORE) {
                $scored[] = ['id' => $candidate['id'], 'score' => $score, 'popularity' => $candidate['popularity']];
            }
        }
        usort($scored, static fn (array $a, array $b): int => [$b['score'], $b['popularity'], $a['id']] <=> [$a['score'], $a['popularity'], $b['id']]);

        $ranked = [];
        foreach ($scored as $row) {
            $ranked[$row['id']] = $row['score'];
        }

        return $ranked;
    }

    public function isSuggestible(string $rawQuery): bool
    {
        return strlen(TextNormalizer::normalize($rawQuery)) >= self::SUGGEST_MIN_CHARS;
    }

    /** @return array<int, float> the best SUGGEST_LIMIT matches */
    public function suggest(string $rawQuery): array
    {
        return $this->isSuggestible($rawQuery) ? array_slice($this->rank($rawQuery), 0, self::SUGGEST_LIMIT, true) : [];
    }
}
