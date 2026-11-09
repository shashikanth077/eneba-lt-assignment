<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

/**
 * How checkout locks the keys it reserves. The best way, `FOR UPDATE SKIP LOCKED` (a buyer never waits for another buyer),
 * exists in MySQL 8.0.1+ and MariaDB 10.6+. XAMPP often still ships MariaDB 10.4, where that syntax is a SQL error, so the app
 * picks its strategy from the server version (LOCK_STRATEGY=auto, the default) or from the setting:
 *
 *   skip  SELECT ... FOR UPDATE SKIP LOCKED   other buyers' locked keys are skipped: nobody waits, nobody deadlocks
 *   wait  SELECT ... FOR UPDATE               a buyer who wants a locked key waits until the other transaction ends (milliseconds),
 *                                             then sees the committed state. Still never sells a key twice.
 */
final class LockStrategy
{
    public const AUTO = 'auto';
    public const SKIP = 'skip';
    public const WAIT = 'wait';

    /** @return bool true = use SKIP LOCKED */
    public static function useSkipLocked(string $setting, string $serverVersion): bool
    {
        return match (strtolower(trim($setting))) {
            self::SKIP => true,
            self::WAIT => false,
            '', self::AUTO => self::serverSupportsSkipLocked($serverVersion),
            default => throw new RuntimeException("LOCK_STRATEGY must be auto, skip or wait (got '$setting')"),
        };
    }

    /**
     * Accepts what PDO reports: "8.0.35", "8.4.0-commercial", "10.11.14-MariaDB-0ubuntu0.24.04.1" and the replication form
     * "5.5.5-10.4.32-MariaDB" that MariaDB clients see. An unreadable version means "do not assume": wait.
     */
    public static function serverSupportsSkipLocked(string $version): bool
    {
        $isMariaDb = stripos($version, 'mariadb') !== false;
        $clean = (string) preg_replace('/^5\.5\.5-/', '', $version);
        if (preg_match('/^(\d+)\.(\d+)\.(\d+)/', $clean, $m) !== 1) {
            return false;
        }
        [$major, $minor, $patch] = [(int) $m[1], (int) $m[2], (int) $m[3]];

        return $isMariaDb
            ? ($major > 10 || ($major === 10 && $minor >= 6))
            : ($major > 8 || ($major === 8 && ($minor > 0 || $patch >= 1)));
    }
}
