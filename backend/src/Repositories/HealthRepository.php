<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;

final class HealthRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function pingDatabase(): bool
    {
        return (int) $this->pdo->query('SELECT 1')->fetchColumn() === 1;
    }
}
