<?php

declare(strict_types=1);

namespace Tests;

use PDO;
use PDOStatement;

/** A real PDO connection that counts statements, to prove "no N+1" and "the cache avoided the database". */
final class CountingPdo extends PDO
{
    public int $statements = 0;

    /** When set, any statement containing this text throws, simulating a database failure at that exact step. */
    public ?string $failOnSql = null;

    /** @param array{host: string, port: int, name: string, user: string, pass: string} $db */
    public function __construct(array $db)
    {
        parent::__construct(
            sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'], $db['port'], $db['name']),
            $db['user'],
            $db['pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false, PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'"],
        );
    }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $this->statements++;
        if ($this->failOnSql !== null && str_contains($query, $this->failOnSql)) {
            throw new \PDOException('simulated database failure');
        }

        return parent::prepare($query, $options);
    }

    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        $this->statements++;

        return $fetchMode === null ? parent::query($query) : parent::query($query, $fetchMode, ...$fetchModeArgs);
    }
}
