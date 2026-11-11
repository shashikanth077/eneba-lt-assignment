<?php

declare(strict_types=1);

namespace App\Services;

use App\Orders\OrderStatus;
use App\Payment\PaymentGateway;
use App\Repositories\CartRepository;
use App\Repositories\KeyRepository;
use App\Repositories\OrderRepository;
use App\Support\Transaction;
use PDO;
use Throwable;
use App\Support\Log;

/**
 * Applies verified Stripe events. The rules that make it safe to be called twice, late, or out of order:
 *
 *  - an event id is recorded in the SAME transaction as its effects: a repeat does nothing, and a crash in the middle
 *    rolls the record back too, so Stripe's retry is processed for real;
 *  - the order row is locked, and "already paid" is a no-op, so a second succeeded event with a DIFFERENT id changes nothing;
 *  - money is only accepted for the exact amount/currency stored on the order;
 *  - a success that arrives after the order was failed/expired/canceled tries to get the keys again; if the stock is gone the
 *    payment is refunded. Nobody is ever charged without getting their keys, and no key is ever delivered twice.
 *
 * Network calls (refund, cancel) happen AFTER the commit.
 */
final class PaymentEventService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly OrderRepository $orders,
        private readonly KeyRepository $keys,
        private readonly CartRepository $cart,
        private readonly OrderLifecycle $lifecycle,
        private readonly PaymentGateway $gateway,
    ) {
    }

    /**
     * @param array<string, mixed> $event a verified Stripe event
     * @return string what happened (for logs and tests): duplicate | paid | failed | canceled | refund_needed | already_handled | unknown_order | ignored
     */
    public function handle(array $event): string
    {
        /** @var list<callable(): void> $afterCommit */
        $afterCommit = [];

        $outcome = Transaction::runWithRetry($this->pdo, function () use ($event, &$afterCommit): string {
            $afterCommit = []; // a retried attempt starts from nothing
            if (!$this->orders->recordEvent((string) $event['id'], (string) $event['type'])) {
                return 'duplicate';
            }
            $intent = is_array($event['data']['object'] ?? null) ? $event['data']['object'] : [];

            return match ($event['type']) {
                'payment_intent.succeeded' => $this->succeeded($intent, $afterCommit),
                'payment_intent.payment_failed' => $this->closed($intent, OrderStatus::FAILED, 'failed', $this->failureReason($intent), $afterCommit),
                'payment_intent.canceled' => $this->closed($intent, OrderStatus::CANCELED, 'canceled', 'payment_canceled', $afterCommit),
                default => 'ignored',
            };
        });

        foreach ($afterCommit as $action) {
            $action();
        }

        return $outcome;
    }

    /** @param array<string, mixed> $intent @param list<callable(): void> $afterCommit */
    private function succeeded(array $intent, array &$afterCommit): string
    {
        $order = $this->lockOrder($intent);
        if ($order === null) {
            Log::warn('payment.unknown_order', 'a payment succeeded at Stripe but belongs to no order of ours', ['intent' => $intent['id'] ?? '?']);

            return 'unknown_order'; // e.g. `stripe trigger payment_intent.succeeded`: a real payment we did not create
        }
        if (in_array($order['status'], [OrderStatus::PAID, OrderStatus::REFUND_NEEDED, OrderStatus::REFUNDED], true)) {
            return 'already_handled';
        }

        $paid = (int) ($intent['amount_received'] ?? $intent['amount'] ?? -1);
        if ($paid !== $order['total_cents'] || strtolower((string) ($intent['currency'] ?? '')) !== strtolower($order['currency'])) {
            return $this->giveUp($order, 'amount_mismatch', $afterCommit);
        }

        $items = $this->orders->items($order['id']);
        $expected = array_sum(array_column($items, 'qty'));

        // Normal case: the keys are still reserved for this order (even past reserved_until, if nobody took them yet).
        $this->keys->sell($order['id']);
        $held = $this->keys->heldByOrder($order['id']);

        if (array_sum($held) < $expected && !$this->reacquire($order, $items, $held)) {
            return $this->giveUp($order, 'out_of_stock_after_payment', $afterCommit);
        }

        $this->orders->markPaid($order['id']);
        $this->cart->removeOffers($order['user_id'], array_column($items, 'offer_id')); // what was bought leaves the cart

        Log::info('payment.paid', 'order paid, keys sold', ['order_id' => $order['id'], 'user_id' => $order['user_id'], 'total_cents' => $order['total_cents']]);

        return 'paid';
    }

    /**
     * The order lost (some of) its reservation before the payment arrived. Take the missing keys now, if there are any.
     *
     * @param array<string, mixed> $order
     * @param list<array{offer_id: int, qty: int}> $items
     * @param array<int, int> $held offer id => keys the order still holds
     */
    private function reacquire(array $order, array $items, array $held): bool
    {
        usort($items, static fn (array $a, array $b): int => $a['offer_id'] <=> $b['offer_id']);
        $new = [];
        foreach ($items as $item) {
            $missing = $item['qty'] - ($held[$item['offer_id']] ?? 0);
            if ($missing <= 0) {
                continue;
            }
            $ids = $this->keys->lockAvailable($item['offer_id'], $missing);
            if (count($ids) < $missing) {
                return false;
            }
            $new[] = $ids;
        }
        foreach ($new as $ids) {
            $this->keys->reserve($ids, $order['id'], $order['reserved_until']);
        }
        $this->keys->sell($order['id']);

        return true;
    }

    /**
     * Paid money we cannot honour: keys go back, the order is marked, and after the commit we try to refund automatically.
     * If the refund call itself fails the order stays `refund_needed` for a human.
     *
     * @param array<string, mixed> $order
     * @param list<callable(): void> $afterCommit
     */
    private function giveUp(array $order, string $reason, array &$afterCommit): string
    {
        Log::error('payment.refund_needed', 'money was received but the order cannot be delivered: refunding', ['order_id' => $order['id'], 'reason' => $reason, 'intent' => $order['stripe_payment_intent_id'] ?? '?']);
        $this->keys->releaseAll($order['id']);
        $this->orders->setStatus($order['id'], OrderStatus::REFUND_NEEDED, $reason);
        $intentId = (string) $order['stripe_payment_intent_id'];
        $orderId = $order['id'];
        $afterCommit[] = function () use ($intentId, $orderId): void {
            try {
                $this->gateway->refund($intentId);
                $this->orders->setStatus($orderId, OrderStatus::REFUNDED, 'refunded_automatically');
                Log::warn('payment.refunded', 'the payment was refunded automatically', ['order_id' => $orderId]);
            } catch (Throwable $e) {
                Log::error('payment.refund_failed', 'the automatic refund FAILED: this order needs a manual refund in the Stripe dashboard', ['order_id' => $orderId, 'intent' => $intentId, 'error' => $e]);
            }
        };

        return 'refund_needed';
    }

    /**
     * payment_failed / canceled: release the keys. A pending order only; anything else is left alone.
     *
     * @param array<string, mixed> $intent
     * @param list<callable(): void> $afterCommit
     */
    private function closed(array $intent, string $status, string $outcome, string $reason, array &$afterCommit): string
    {
        $order = $this->lockOrder($intent);
        if ($order === null || !$this->lifecycle->closePending($order, $status, $reason)) {
            return $order === null ? 'unknown_order' : 'already_handled';
        }
        if ($status === OrderStatus::FAILED && $order['stripe_payment_intent_id'] !== null) {
            // The intent can be retried by the buyer; we already gave the keys away, so make sure it cannot succeed later.
            $intentId = $order['stripe_payment_intent_id'];
            $afterCommit[] = fn () => $this->lifecycle->cancelIntentQuietly($intentId);
        }

        return $outcome;
    }

    /**
     * Finds and locks the order of a payment intent: by intent id, or (if saving the id ever failed after Stripe created
     * the intent) by the order id we put in its metadata.
     *
     * @param array<string, mixed> $intent
     * @return array<string, mixed>|null
     */
    private function lockOrder(array $intent): ?array
    {
        $intentId = (string) ($intent['id'] ?? '');
        if ($intentId === '') {
            return null;
        }
        $order = $this->orders->findByPaymentIntent($intentId, forUpdate: true);
        if ($order !== null) {
            return $order;
        }
        $orderId = (int) ($intent['metadata']['order_id'] ?? 0);
        $order = $orderId > 0 ? $this->orders->find($orderId, forUpdate: true) : null;
        if ($order === null || $order['stripe_payment_intent_id'] !== null) {
            return null;
        }
        $this->orders->attachPaymentIntent($order['id'], $intentId);

        return ['stripe_payment_intent_id' => $intentId] + $order;
    }

    /** @param array<string, mixed> $intent */
    private function failureReason(array $intent): string
    {
        $message = $intent['last_payment_error']['message'] ?? 'payment_failed';

        return mb_substr(is_string($message) ? $message : 'payment_failed', 0, 255);
    }
}
