<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;
use PDO;

/** First-run helper: a fresh XAMPP has a MySQL server but no `keymart` database, and migrations need one to exist. */
final class DatabaseBootstrap
{
    /** Names go into a CREATE DATABASE statement (identifiers cannot be bound), so only plain ones are accepted. */
    public static function assertSafeName(string $name): void
    {
        if (preg_match('/^[A-Za-z0-9_]{1,64}$/', $name) !== 1) {
            throw new InvalidArgumentException("Database name '$name' must be 1-64 letters, digits or underscores");
        }
    }

    /**
     * Connects to the server WITHOUT selecting a database.
     *
     * @param array{host: string, port: int, name: string, user: string, pass: string} $db
     */
    public static function connectToServer(array $db): PDO
    {
        return new PDO(sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $db['host'], $db['port']), $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    /**
     * Creates the database when it is missing.
     *
     * @param array{host: string, port: int, name: string, user: string, pass: string} $db
     * @return bool true when it had to be created
     */
    public static function ensureExists(array $db): bool
    {
        self::assertSafeName($db['name']);
        $server = self::connectToServer($db);
        $exists = $server->prepare('SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = ?');
        $exists->execute([$db['name']]);
        if ((int) $exists->fetchColumn() > 0) {
            return false;
        }
        $server->exec('CREATE DATABASE `' . $db['name'] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

        return true;
    }
}
