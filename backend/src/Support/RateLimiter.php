<?php

declare(strict_types=1);

namespace App\Support;

use App\Exceptions\ApiException;
use PDO;

/**
 * Fixed-window request limiter backed by the database, so it works the same behind several PHP workers (a counter in memory would not).
 *
 * Counting a request is ONE atomic statement (INSERT ... ON DUPLICATE KEY UPDATE hits = hits + 1) followed by a read of the count: a
 * request is allowed only if the count it reads, which includes its own increment, is within the limit. Each allowed request counted at
 * least its own position, so no burst of parallel requests can get more than `limit` through (same argument as LoginThrottle).
 * Fixed windows are coarse (a client can use the limit twice around a boundary) but explainable, cheap, and enough for abuse control.
 */
final class RateLimiter
{
    public function __construct(private readonly PDO $pdo, private readonly bool $enabled = true)
    {
    }

    /**
     * @throws ApiException 429 rate_limited, with details.retryAfterSeconds (also sent as the Retry-After header)
     */
    public function hit(string $bucket, string $subject, int $limit, int $windowSeconds, ?int $now = null): void
    {
        if (!$this->enabled || $limit <= 0) {
            return;
        }
        $now ??= time();
        $window = intdiv($now, $windowSeconds) * $windowSeconds;
        $subject = mb_substr($subject, 0, 64);

        $this->pdo->prepare('INSERT INTO rate_limits (bucket, subject, window_start, hits) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1')
            ->execute([$bucket, $subject, $window]);
        $read = $this->pdo->prepare('SELECT hits FROM rate_limits WHERE bucket = ? AND subject = ? AND window_start = ?');
        $read->execute([$bucket, $subject, $window]);
        $hits = (int) $read->fetchColumn();

        if ($hits === 1) {
            // a subject's first request of a window is a cheap moment to forget windows that ended long ago
            $this->pdo->prepare('DELETE FROM rate_limits WHERE window_start < ?')->execute([$now - 86400 - $windowSeconds]);
        }
        if ($hits > $limit) {
            throw new ApiException(429, 'rate_limited', 'Too many requests, please slow down', [
                'retryAfterSeconds' => max(1, $window + $windowSeconds - $now),
            ]);
        }
    }
}
