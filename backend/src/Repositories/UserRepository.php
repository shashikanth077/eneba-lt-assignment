<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Exceptions\ApiException;
use PDO;
use PDOException;

/** @phpstan-type User array{id: int, email: string, password_hash: string, display_name: string, token_version: int} */
final class UserRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return User|null */
    public function findByEmail(string $email): ?array
    {
        return $this->one('SELECT * FROM users WHERE email = ?', [$email]);
    }

    /** @return User|null */
    public function findById(int $id): ?array
    {
        return $this->one('SELECT * FROM users WHERE id = ?', [$id]);
    }

    public function create(string $email, string $passwordHash, string $displayName): int
    {
        try {
            $this->pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
                ->execute([$email, $passwordHash, $displayName]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1062) { // unique key: also catches two simultaneous sign-ups
                throw ApiException::conflict('email_taken', 'An account with this email already exists');
            }
            throw $e;
        }

        return (int) $this->pdo->lastInsertId();
    }

    public function bumpTokenVersion(int $id): void
    {
        $this->pdo->prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?')->execute([$id]);
    }

    public function updatePasswordHash(int $id, string $hash): void
    {
        $this->pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $id]);
    }

    /**
     * @param list<mixed> $params
     * @return User|null
     */
    private function one(string $sql, array $params): ?array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $row['id'] = (int) $row['id'];
        $row['token_version'] = (int) $row['token_version'];

        return $row;
    }
}
