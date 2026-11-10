<?php

declare(strict_types=1);

namespace App\Services;

use App\Repositories\HealthRepository;

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
            error_log('[health] could not release expired reservations: ' . $e->getMessage());
        }

        // "empty" explains a store whose lists are all empty although everything answers 200; it does not make the service unhealthy.
        return ['status' => 'ok', 'db' => 'ok', 'stock' => $this->health->hasAvailableKeys() ? 'ok' : 'empty'];
    }
}
