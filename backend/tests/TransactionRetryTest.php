<?php

declare(strict_types=1);

namespace Tests;

use App\Support\Transaction;
use PDOException;

final class TransactionRetryTest extends DbTestCase
{
    private static function deadlock(): PDOException
    {
        $e = new PDOException('Deadlock found when trying to get lock; try restarting transaction');
        $e->errorInfo = ['40001', 1213, 'Deadlock found'];

        return $e;
    }

    public function testADeadlockVictimIsRetriedFromTheStartAndTheFirstAttemptIsRolledBack(): void
    {
        $attempts = 0;
        $result = Transaction::runWithRetry(self::$pdo, function () use (&$attempts): string {
            $attempts++;
            self::$pdo->exec("INSERT INTO stripe_events (event_id, type) VALUES ('evt_retry_$attempts', 'x')");
            if ($attempts === 1) {
                throw self::deadlock();
            }

            return 'done';
        });

        self::assertSame('done', $result);
        self::assertSame(2, $attempts);
        $ids = self::$pdo->query("SELECT event_id FROM stripe_events WHERE event_id LIKE 'evt_retry_%'")->fetchAll(\PDO::FETCH_COLUMN);
        self::assertSame(['evt_retry_2'], $ids, 'the failed attempt left nothing behind');
    }

    public function testItGivesUpAfterTheAllowedAttempts(): void
    {
        $attempts = 0;
        try {
            Transaction::runWithRetry(self::$pdo, function () use (&$attempts): never {
                $attempts++;
                throw self::deadlock();
            }, 3);
            self::fail('expected the deadlock to surface');
        } catch (PDOException $e) {
            self::assertTrue(Transaction::isDeadlock($e));
        }
        self::assertSame(3, $attempts);
        self::assertFalse(self::$pdo->inTransaction());
    }

    public function testOtherErrorsAreNeverRetried(): void
    {
        $attempts = 0;
        $timeout = new PDOException('Lock wait timeout exceeded');
        $timeout->errorInfo = ['HY000', 1205, 'Lock wait timeout exceeded'];

        $this->expectExceptionObject($timeout);
        try {
            Transaction::runWithRetry(self::$pdo, function () use (&$attempts, $timeout): never {
                $attempts++;
                throw $timeout;
            });
        } finally {
            self::assertSame(1, $attempts);
        }
    }

    public function testApplicationErrorsAreNeverRetried(): void
    {
        $attempts = 0;
        try {
            Transaction::runWithRetry(self::$pdo, function () use (&$attempts): never {
                $attempts++;
                throw new \DomainException('out of stock');
            });
        } catch (\DomainException) {
        }
        self::assertSame(1, $attempts);
    }
}
