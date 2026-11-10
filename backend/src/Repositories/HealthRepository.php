<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;

final class HealthRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** Is anything buyable? false on a database that was imported but never given game keys (docs/RAILWAY.md, step 5). */
    public function hasAvailableKeys(): bool
    {
        return $this->pdo->query("SELECT 1 FROM game_keys WHERE status = 'available' LIMIT 1")->fetchColumn() !== false;
    }

    public function pingDatabase(): bool
    {
        return (int) $this->pdo->query('SELECT 1')->fetchColumn() === 1;
    }
}
