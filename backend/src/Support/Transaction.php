<?php

declare(strict_types=1);

namespace App\Support;

use PDO;
use PDOException;
use Throwable;

final class Transaction
{
    /**
     * Runs $work in one transaction: commit when it returns, roll back when it throws (and rethrow).
     * Not re-entrant: services that already hold a transaction call the repositories directly instead.
     *
     * @template T
     * @param callable(): T $work
     * @return T
     */
    public static function run(PDO $pdo, callable $work): mixed
    {
        $pdo->beginTransaction();
        try {
            $result = $work();
            $pdo->commit();

            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Like run(), but starts the whole transaction again when the database picked it as the victim of a deadlock. Without SKIP LOCKED
     * (older MariaDB) two checkouts that lock overlapping keys can deadlock; the database rolls one back and the retry succeeds.
     * Only deadlocks are retried: a lock WAIT timeout means something is stuck and retrying would just wait again.
     *
     * @template T
     * @param callable(): T $work must be safe to run again from the start (it is rolled back completely first)
     * @return T
     */
    public static function runWithRetry(PDO $pdo, callable $work, int $attempts = 3): mixed
    {
        for ($attempt = 1; ; $attempt++) {
            try {
                return self::run($pdo, $work);
            } catch (PDOException $e) {
                if ($attempt >= $attempts || !self::isDeadlock($e)) {
                    throw $e;
                }
                usleep(random_int(10_000, 60_000) * $attempt); // a little jitter so the two victims do not collide again
            }
        }
    }

    public static function isDeadlock(PDOException $e): bool
    {
        return ($e->errorInfo[0] ?? null) === '40001' || (int) ($e->errorInfo[1] ?? 0) === 1213;
    }

    /** 'Y-m-d H:i:s' (UTC, as stored) -> ISO 8601 with a Z, which is what the API returns. */
    public static function iso(string $utcDatetime): string
    {
        return str_replace(' ', 'T', $utcDatetime) . 'Z';
    }
}
