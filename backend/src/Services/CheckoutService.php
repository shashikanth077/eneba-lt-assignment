<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Orders\OrderStatus;
use App\Payment\PaymentGateway;
use App\Payment\PaymentGatewayException;
use App\Repositories\CartRepository;
use App\Repositories\KeyRepository;
use App\Repositories\OrderRepository;
use App\Support\Transaction;
use PDO;
use Throwable;
use App\Support\Log;

/**
 * Cart -> pending order + reserved keys + a Stripe PaymentIntent.
 *
 *  1. In ONE database transaction: read the cart (live prices), lock the keys with FOR UPDATE SKIP LOCKED, and only if
 *     every line can be fully covered create the order and reserve the keys. Any shortage rolls everything back
 *     (all-or-nothing) and reports every offending line.
 *  2. After the commit (never hold row locks across a network call): ask the provider for a payment of the amount WE computed.
 *  3. If the provider fails, the order is closed and the keys go back to the shelf.
 */
final class CheckoutService
{
    /** Stripe cannot charge less than 0.50 in EUR. */
    public const MIN_AMOUNT_CENTS = 50;

    public function __construct(
        private readonly PDO $pdo,
        private readonly CartRepository $cart,
        private readonly OrderRepository $orders,
        private readonly KeyRepository $keys,
        private readonly OrderLifecycle $lifecycle,
        private readonly PaymentGateway $gateway,
        private readonly string $currency,
        private readonly int $reservationMinutes,
    ) {
    }

    /** @return array{orderId: int, clientSecret: string, totalCents: int, currency: string, reservedUntil: string} */
    public function checkout(int $userId): array
    {
        // Housekeeping first, so keys whose reservation ran out are available to this buyer, and so one user cannot
        // hoard stock by starting checkout again and again: a new checkout replaces the user's earlier pending orders.
        $this->lifecycle->expireDue();
        foreach ($this->orders->pendingIdsOfUser($userId) as $earlier) {
            $this->lifecycle->closeAndCancelIntent($earlier, OrderStatus::CANCELED, 'replaced_by_new_checkout');
        }

        Log::info('checkout.started', 'checkout started', ['user_id' => $userId]);
        try {
            $reservation = $this->reserve($userId);
        } catch (ApiException $e) {
            // cart_empty, out_of_stock (with the offers that failed), amount_too_small: refusals the buyer sees as such
            Log::warn('checkout.refused', 'checkout refused: ' . $e->errorCode(), ['user_id' => $userId, 'reason' => $e->errorCode(), 'details' => $e->details()]);
            throw $e;
        }
        Log::info('checkout.reserved', 'keys reserved and order created, waiting for the payment', ['user_id' => $userId, 'order_id' => $reservation['orderId'], 'total_cents' => $reservation['totalCents']]);

        try {
            $intent = $this->gateway->createIntent(
                $reservation['totalCents'],
                $this->currency,
                $reservation['orderId'],
                'order-' . $reservation['orderId'],
            );
            $this->orders->attachPaymentIntent($reservation['orderId'], $intent['id']);
            Log::info('checkout.intent', 'payment intent created at Stripe', ['order_id' => $reservation['orderId'], 'intent' => $intent['id']]);
        } catch (Throwable $e) {
            $this->lifecycle->close($reservation['orderId'], OrderStatus::FAILED, 'payment_provider_error');
            Log::error('checkout.intent.failed', 'the payment provider refused or was unreachable; the keys were released', ['order_id' => $reservation['orderId'], 'error' => $e]);
            if ($e instanceof PaymentGatewayException) {
                throw new ApiException(502, 'payment_provider_error', 'The payment provider is not available, please try again');
            }
            throw $e;
        }

        return [
            'orderId' => $reservation['orderId'],
            'clientSecret' => $intent['clientSecret'],
            'totalCents' => $reservation['totalCents'],
            'currency' => strtoupper($this->currency),
            'reservedUntil' => Transaction::iso($reservation['reservedUntil']),
        ];
    }

    /** @return array{orderId: int, totalCents: int, reservedUntil: string} */
    private function reserve(int $userId): array
    {
        return Transaction::runWithRetry($this->pdo, function () use ($userId): array {
            $lines = $this->cart->lines($userId); // live prices, read inside the transaction
            if ($lines === []) {
                throw new ApiException(422, 'cart_empty', 'Your cart is empty');
            }
            // Always lock offers in ascending id order: two buyers with overlapping carts then take locks in the same
            // order and can never deadlock each other (SKIP LOCKED already means nobody waits at all).
            usort($lines, static fn (array $a, array $b): int => $a['offer_id'] <=> $b['offer_id']);

            $locked = [];
            $problems = [];
            foreach ($lines as $line) {
                if (!$line['active']) {
                    $problems[] = ['offerId' => $line['offer_id'], 'code' => 'inactive', 'requested' => $line['qty'], 'available' => 0];
                    continue;
                }
                $ids = $this->keys->lockAvailable($line['offer_id'], $line['qty']);
                if (count($ids) < $line['qty']) {
                    $problems[] = ['offerId' => $line['offer_id'], 'code' => 'out_of_stock', 'requested' => $line['qty'], 'available' => count($ids)];
                    continue;
                }
                $locked[$line['offer_id']] = $ids;
            }
            if ($problems !== []) {
                throw ApiException::conflict('out_of_stock', 'Some items are no longer available, nothing was reserved', ['items' => $problems]);
            }

            $total = array_sum(array_map(static fn (array $l): int => $l['price_cents'] * $l['qty'], $lines));
            if ($total < self::MIN_AMOUNT_CENTS) {
                throw new ApiException(422, 'amount_too_small', 'The order total is below the minimum of 0.50');
            }

            $until = $this->orders->deadline($this->reservationMinutes);
            $orderId = $this->orders->create($userId, $this->currency, $total, $until);
            $this->orders->addItems($orderId, array_map(static fn (array $l): array => [
                'offer_id' => $l['offer_id'],
                'product_id' => $l['product_id'],
                'product_slug' => $l['product_slug'],
                'product_name' => $l['product_name'],
                'seller_name' => $l['seller_name'],
                'unit_price_cents' => $l['price_cents'],
                'qty' => $l['qty'],
            ], $lines));
            foreach ($locked as $keyIds) {
                $this->keys->reserve($keyIds, $orderId, $until);
            }

            return ['orderId' => $orderId, 'totalCents' => $total, 'reservedUntil' => $until];
        });
    }
}
