<?php

declare(strict_types=1);

namespace App\Support;

use PDO;

final class Database
{
    /** @param array{host: string, port: int, name: string, user: string, pass: string} $db */
    public static function connect(array $db): PDO
    {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'], $db['port'], $db['name']);

        return new PDO($dsn, $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false, // real prepared statements
            PDO::ATTR_STRINGIFY_FETCHES => false,
            // NOW(), reserved_until and every DATETIME column are UTC, whatever the server's own time zone is
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'",
        ]);
    }
}
