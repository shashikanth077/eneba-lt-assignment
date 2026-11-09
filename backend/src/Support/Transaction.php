<?php

declare(strict_types=1);

namespace App\Support;

use PDO;
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

    /** 'Y-m-d H:i:s' (UTC, as stored) -> ISO 8601 with a Z, which is what the API returns. */
    public static function iso(string $utcDatetime): string
    {
        return str_replace(' ', 'T', $utcDatetime) . 'Z';
    }
}
