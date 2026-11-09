<?php

declare(strict_types=1);

namespace App\Services;

use App\Orders\OrderStatus;
use App\Payment\PaymentGateway;
use App\Repositories\KeyRepository;
use App\Repositories\OrderRepository;
use App\Support\Transaction;
use PDO;
use Throwable;

/**
 * Closing a pending order (failed / expired / canceled): the status changes and the reserved keys go back to the shelf in
 * ONE transaction, then the provider is told to cancel the payment so it cannot succeed after the keys were released.
 * Every path that releases keys uses this class, so there is exactly one way to do it.
 */
final class OrderLifecycle
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly OrderRepository $orders,
        private readonly KeyRepository $keys,
        private readonly PaymentGateway $gateway,
    ) {
    }

    /**
     * For callers that already hold a transaction and the order's row lock (the webhook handler).
     *
     * @param array{id: int, status: string} $order
     * @return bool true when the order was pending and is now closed
     */
    public function closePending(array $order, string $status, ?string $reason): bool
    {
        if ($order['status'] !== OrderStatus::PENDING) {
            return false;
        }
        $this->orders->setStatus($order['id'], $status, $reason);
        $this->keys->release($order['id']);

        return true;
    }

    /** Own transaction. Returns the payment intent to cancel, or null when there was nothing to close. */
    public function close(int $orderId, string $status, ?string $reason): ?string
    {
        return Transaction::runWithRetry($this->pdo, function () use ($orderId, $status, $reason): ?string {
            $order = $this->orders->find($orderId, forUpdate: true);
            if ($order === null || !$this->closePending($order, $status, $reason)) {
                return null;
            }

            return $order['stripe_payment_intent_id'];
        });
    }

    public function closeAndCancelIntent(int $orderId, string $status, ?string $reason): void
    {
        $intentId = $this->close($orderId, $status, $reason);
        if ($intentId !== null) {
            $this->cancelIntentQuietly($intentId);
        }
    }

    /** Releases every reservation that ran out (all users, or one), so its keys can be bought by someone else. */
    public function expireDue(?int $userId = null): void
    {
        foreach ($this->orders->dueIds($userId) as $orderId) {
            $this->closeAndCancelIntent($orderId, OrderStatus::EXPIRED, 'reservation_expired');
        }
    }

    /** Best effort: if the provider is unreachable the order is still closed, and a late success is handled by the webhook. */
    public function cancelIntentQuietly(string $intentId): void
    {
        try {
            $this->gateway->cancelIntent($intentId);
        } catch (Throwable $e) {
            error_log('[orders] could not cancel payment ' . $intentId . ': ' . $e->getMessage());
        }
    }
}
