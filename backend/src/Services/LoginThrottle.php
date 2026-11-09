<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Repositories\LoginAttemptRepository;

/**
 * Failed-login limiter. Two counters inside one sliding window:
 *  - per (IP, email): stops guessing one account,
 *  - per IP: stops spraying many accounts.
 * Both count attempts whether or not the email exists, so a 429 reveals nothing about accounts.
 */
final class LoginThrottle
{
    public function __construct(
        private readonly LoginAttemptRepository $attempts,
        private readonly int $maxPerPair,
        private readonly int $maxPerIp,
        private readonly int $windowSeconds,
    ) {
    }

    public static function emailHash(string $normalizedEmail): string
    {
        return hash('sha256', $normalizedEmail);
    }

    /**
     * Counts this attempt FIRST, then decides. Checking the counters before the password and recording the failure afterwards (the old
     * order) let a burst of parallel requests all pass the check before any of them recorded anything, so N parallel guesses got N tries.
     * Here every request inserts its own row and then counts: a request is let through only if the count, which includes its own row and
     * every row inserted before it, is still within the limit. Passing requests can be ordered by when they counted; the k-th one counts
     * at least k rows. So at most `max` requests ever reach the password check, however many arrive at once.
     * A successful login deletes the pair's rows again (`reset`), including the one claimed here.
     *
     * @throws ApiException 429 when the caller is locked out
     */
    public function claimAttempt(string $ip, string $emailHash): void
    {
        $this->attempts->purgeOlderThan($this->windowSeconds * 4);
        $this->attempts->recordFailure($ip, $emailHash);

        if (
            $this->attempts->failuresForPair($ip, $emailHash, $this->windowSeconds) > $this->maxPerPair
            || $this->attempts->failuresForIp($ip, $this->windowSeconds) > $this->maxPerIp
        ) {
            $retryAfter = $this->attempts->secondsUntilIpRelief($ip, $this->windowSeconds);
            throw new ApiException(429, 'too_many_attempts', 'Too many failed sign-in attempts, try again later', [
                'retryAfterSeconds' => $retryAfter,
            ]);
        }
    }

    public function reset(string $ip, string $emailHash): void
    {
        $this->attempts->clearFailures($ip, $emailHash);
    }
}
