<?php

declare(strict_types=1);

namespace App\Search;

/**
 * Re-ranks one candidate title against the query. Pure function of two normalised strings, no I/O.
 *
 *   score = 0.50 * tokenScore  +  0.30 * trigramScore  +  bonus        (clamped to 0..1)
 *
 *  tokenScore   Each QUERY token is matched on its own against the best title token (so word ORDER does not
 *               matter): 1 - levenshtein/maxLen for typos, or 0.92 * the same against the title word's start
 *               for a partly typed word ("cyber" ~ "cyberpunk"), or 0.85 when it appears inside the title
 *               ("punk" in "cyberpunk"). Tokens up to 3 chars must match exactly (typo tolerance on "3" or "of"
 *               only creates noise). The score is the mean over query tokens.
 *  coverage     In a multi-word query, a significant word (4+ letters) that matches nothing in the title
 *               (< 0.6) multiplies the whole score by 0.6: "wither 3" must not return every title ending in 3.
 *  trigramScore 0.6 * containment (share of the QUERY's trigrams found in the title: good for partial names)
 *               + 0.4 * Jaccard (symmetric: stops one-word queries from preferring very long titles).
 *  bonus        exact title +0.20, title starts with the query +0.10, every query token is the start of a
 *               distinct title word +0.10 (a title can collect at most 0.20).
 */
final class Scorer
{
    private const TOKEN_WEIGHT = 0.50;
    private const TRIGRAM_WEIGHT = 0.30;
    private const PREFIX_FACTOR = 0.92;
    private const EXACT_ONLY_UP_TO = 3;
    private const SUBSTRING_CREDIT = 0.85;
    private const SIGNIFICANT_LENGTH = 4;
    private const UNMATCHED_BELOW = 0.6;
    private const UNMATCHED_PENALTY = 0.6;

    public static function score(string $query, string $title): float
    {
        $queryTokens = TextNormalizer::tokens($query);
        $titleTokens = TextNormalizer::tokens($title);
        if ($queryTokens === [] || $titleTokens === []) {
            return 0.0;
        }

        $perToken = self::tokenScores($queryTokens, $titleTokens, $title);
        $score = self::TOKEN_WEIGHT * (array_sum($perToken) / count($perToken))
            + self::TRIGRAM_WEIGHT * self::trigramScore($query, $title)
            + self::bonus($query, $title, $queryTokens, $titleTokens);

        if (count($queryTokens) > 1) {
            foreach ($queryTokens as $i => $token) {
                if (strlen($token) >= self::SIGNIFICANT_LENGTH && $perToken[$i] < self::UNMATCHED_BELOW) {
                    $score *= self::UNMATCHED_PENALTY;
                    break;
                }
            }
        }

        return round(min(1.0, $score), 4);
    }

    /**
     * @param list<string> $queryTokens
     * @param list<string> $titleTokens
     * @return list<float> best match (0..1) of each query token, same order as the query
     */
    private static function tokenScores(array $queryTokens, array $titleTokens, string $title): array
    {
        $scores = [];
        foreach ($queryTokens as $q) {
            $best = 0.0;
            $qLen = strlen($q);
            foreach ($titleTokens as $t) {
                $tLen = strlen($t);
                if ($qLen <= self::EXACT_ONLY_UP_TO) {
                    $candidate = $q === $t ? 1.0 : (str_starts_with($t, $q) ? self::PREFIX_FACTOR : 0.0);
                } else {
                    $candidate = 1 - levenshtein($q, $t) / max($qLen, $tLen);
                    if ($tLen > $qLen) { // partly typed word: compare with the same-length start of the title word
                        $candidate = max($candidate, self::PREFIX_FACTOR * (1 - levenshtein($q, substr($t, 0, $qLen)) / $qLen));
                    }
                }
                $best = max($best, $candidate);
            }
            if ($qLen >= self::EXACT_ONLY_UP_TO && str_contains($title, $q)) {
                $best = max($best, self::SUBSTRING_CREDIT);
            }
            $scores[] = max(0.0, $best);
        }

        return $scores;
    }

    private static function trigramScore(string $query, string $title): float
    {
        $q = TextNormalizer::trigrams($query);
        $t = TextNormalizer::trigrams($title);
        $shared = count(array_intersect_key($q, $t));
        if ($shared === 0) {
            return 0.0;
        }
        $containment = $shared / count($q);
        $jaccard = $shared / (count($q) + count($t) - $shared);

        return 0.6 * $containment + 0.4 * $jaccard;
    }

    /**
     * @param list<string> $queryTokens
     * @param list<string> $titleTokens
     */
    private static function bonus(string $query, string $title, array $queryTokens, array $titleTokens): float
    {
        $bonus = 0.0;
        if ($query === $title) {
            $bonus += 0.20;
        } elseif (str_starts_with($title, $query)) {
            $bonus += 0.10;
        }

        $free = $titleTokens;
        $allPrefixes = true;
        foreach ($queryTokens as $q) {
            $hit = array_search(true, array_map(static fn (string $t): bool => str_starts_with($t, $q), $free), true);
            if ($hit === false) {
                $allPrefixes = false;
                break;
            }
            unset($free[$hit]); // each title word can be claimed by one query token only
        }
        if ($allPrefixes) {
            $bonus += 0.10;
        }

        return min(0.20, $bonus);
    }
}
