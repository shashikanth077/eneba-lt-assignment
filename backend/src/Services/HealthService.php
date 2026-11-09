<?php

declare(strict_types=1);

namespace App\Services;

use App\Repositories\HealthRepository;

final class HealthService
{
    public function __construct(private readonly HealthRepository $health)
    {
    }

    /** @return array{status: string, db: string} */
    public function check(): array
    {
        // A connection failure surfaces as a PDOException; JsonErrorHandler maps it to 503 db_unavailable.
        $this->health->pingDatabase();

        return ['status' => 'ok', 'db' => 'ok'];
    }
}
