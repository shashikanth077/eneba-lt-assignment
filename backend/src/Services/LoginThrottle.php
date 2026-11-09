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

    /** @throws ApiException 429 when the caller is locked out */
    public function assertAllowed(string $ip, string $emailHash): void
    {
        $this->attempts->purgeOlderThan($this->windowSeconds * 4);

        if (
            $this->attempts->failuresForPair($ip, $emailHash, $this->windowSeconds) >= $this->maxPerPair
            || $this->attempts->failuresForIp($ip, $this->windowSeconds) >= $this->maxPerIp
        ) {
            $retryAfter = $this->attempts->secondsUntilIpRelief($ip, $this->windowSeconds);
            throw new ApiException(429, 'too_many_attempts', 'Too many failed sign-in attempts, try again later', [
                'retryAfterSeconds' => $retryAfter,
            ]);
        }
    }

    public function recordFailure(string $ip, string $emailHash): void
    {
        $this->attempts->recordFailure($ip, $emailHash);
    }

    public function reset(string $ip, string $emailHash): void
    {
        $this->attempts->clearFailures($ip, $emailHash);
    }
}
