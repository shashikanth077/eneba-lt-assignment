<?php

declare(strict_types=1);

namespace App\Services;

use App\Repositories\HealthRepository;

final class HealthService
{
    public function __construct(private readonly HealthRepository $health)
    {
    }

    /** @return array{status: string, db: string, stock: string} */
    public function check(): array
    {
        // A connection failure surfaces as a PDOException; JsonErrorHandler maps it to 503 db_unavailable.
        $this->health->pingDatabase();

        // "empty" explains a store whose lists are all empty although everything answers 200; it does not make the service unhealthy.
        return ['status' => 'ok', 'db' => 'ok', 'stock' => $this->health->hasAvailableKeys() ? 'ok' : 'empty'];
    }
}
