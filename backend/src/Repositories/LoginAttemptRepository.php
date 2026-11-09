<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;

final class LoginAttemptRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function recordFailure(string $ip, string $emailHash): void
    {
        $this->pdo->prepare('INSERT INTO login_attempts (ip, email_hash, succeeded) VALUES (?, ?, 0)')->execute([$ip, $emailHash]);
    }

    public function failuresForPair(string $ip, string $emailHash, int $windowSeconds): int
    {
        return $this->count(
            'SELECT COUNT(*) FROM login_attempts WHERE succeeded = 0 AND ip = ? AND email_hash = ? AND attempted_at >= NOW() - INTERVAL ? SECOND',
            [$ip, $emailHash, $windowSeconds],
        );
    }

    public function failuresForIp(string $ip, int $windowSeconds): int
    {
        return $this->count(
            'SELECT COUNT(*) FROM login_attempts WHERE succeeded = 0 AND ip = ? AND attempted_at >= NOW() - INTERVAL ? SECOND',
            [$ip, $windowSeconds],
        );
    }

    /** Seconds until the oldest counted failure of this IP falls out of the window. */
    public function secondsUntilIpRelief(string $ip, int $windowSeconds): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT TIMESTAMPDIFF(SECOND, MIN(attempted_at), NOW()) FROM login_attempts
             WHERE succeeded = 0 AND ip = ? AND attempted_at >= NOW() - INTERVAL ? SECOND',
        );
        $stmt->execute([$ip, $windowSeconds]);
        $age = $stmt->fetchColumn();

        return max(1, $windowSeconds - (int) $age);
    }

    public function clearFailures(string $ip, string $emailHash): void
    {
        $this->pdo->prepare('DELETE FROM login_attempts WHERE ip = ? AND email_hash = ?')->execute([$ip, $emailHash]);
    }

    public function purgeOlderThan(int $seconds): void
    {
        $this->pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL ? SECOND')->execute([$seconds]);
    }

    /** @param list<mixed> $params */
    private function count(string $sql, array $params): int
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        return (int) $stmt->fetchColumn();
    }
}
