<?php

declare(strict_types=1);

namespace App\Services;

use App\Repositories\HealthRepository;
use App\Support\Log;

final class HealthService
{
    public function __construct(
        private readonly HealthRepository $health,
        private readonly OrderLifecycle $lifecycle,
    ) {
    }

    /** @return array{status: string, db: string, stock: string} */
    public function check(): array
    {
        // A connection failure surfaces as a PDOException; JsonErrorHandler maps it to 503 db_unavailable.
        $this->health->pingDatabase();
        // Stock = keys on the shelf, and a reservation that ran out only returns its keys when somebody closes it. Uptime monitors ping this
        // endpoint every few minutes, which makes it the natural place to do it, so the catalogue never shows keys stuck behind a dead
        // checkout. Idempotent and bounded; a failure here must never make the health check itself fail.
        try {
            $this->lifecycle->expireDue();
        } catch (\Throwable $e) {
            Log::warn('health.sweep_failed', 'could not release expired reservations', ['error' => $e]);
        }

        // "empty" explains a store whose lists are all empty although everything answers 200; it does not make the service unhealthy.
        $stock = $this->health->hasAvailableKeys() ? 'ok' : 'empty';
        if ($stock === 'empty') {
            Log::warn('health.stock.empty', 'NO game key is available: every game shows Out of stock (seed the database, docs/KEYS.md)');
        }

        return ['status' => 'ok', 'db' => 'ok', 'stock' => $stock];
    }
}
