<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Orders\OrderStatus;
use App\Payment\PaymentGateway;
use App\Repositories\KeyRepository;
use App\Repositories\OrderRepository;
use App\Support\KeyCipher;
use App\Support\Transaction;
use App\Support\Log;

/** Order history and detail. Keys are decrypted here and only here, and only for a PAID order of the CALLER. */
final class OrderService
{
    public function __construct(
        private readonly OrderRepository $orders,
        private readonly KeyRepository $keys,
        private readonly KeyCipher $cipher,
        private readonly OrderLifecycle $lifecycle,
        private readonly PaymentGateway $gateway,
        private readonly PaymentEventService $payments,
    ) {
    }

    /** @return array{items: list<array<string, mixed>>, page: int, pageSize: int, total: int} */
    public function list(int $userId, int $page, int $pageSize): array
    {
        $this->lifecycle->expireDue($userId); // a reservation that ran out should read as expired, not pending
        $result = $this->orders->listForUser($userId, $page, $pageSize);

        return [
            'items' => array_map(static fn (array $o): array => [
                'id' => $o['id'],
                'status' => $o['status'],
                'totalCents' => $o['total_cents'],
                'createdAt' => Transaction::iso($o['created_at']),
                'itemCount' => $o['item_count'],
            ], $result['rows']),
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => $result['total'],
        ];
    }

    /**
     * @return array{order: array<string, mixed>}
     * @throws ApiException 404 for an unknown order AND for somebody else's order (existence is not revealed)
     */
    public function get(int $userId, int $orderId): array
    {
        $this->lifecycle->expireDue($userId);
        $order = $this->orders->find($orderId);
        if ($order === null || $order['user_id'] !== $userId) {
            throw ApiException::notFound('Order not found');
        }

        if ($order['status'] === OrderStatus::PENDING && ($order['stripe_payment_intent_id'] ?? null) !== null) {
            $this->confirmWithProvider((string) $order['stripe_payment_intent_id']);
            $order = $this->orders->find($orderId) ?? $order;
        }

        $keysByOffer = $order['status'] === OrderStatus::PAID ? $this->keys->soldKeysOfOrder($orderId) : [];
        $items = array_map(function (array $item) use ($keysByOffer): array {
            $line = [
                'productSlug' => $item['product_slug'],
                'productName' => $item['product_name'],
                'sellerName' => $item['seller_name'],
                'unitPriceCents' => $item['unit_price_cents'],
                'qty' => $item['qty'],
            ];
            if (isset($keysByOffer[$item['offer_id']])) {
                $line['keys'] = array_map($this->cipher->decrypt(...), $keysByOffer[$item['offer_id']]);
            }

            return $line;
        }, $this->orders->items($orderId));

        $view = [
            'id' => $order['id'],
            'status' => $order['status'],
            'totalCents' => $order['total_cents'],
            'currency' => strtoupper($order['currency']),
            'createdAt' => Transaction::iso($order['created_at']),
        ];
        if ($order['status'] === OrderStatus::PENDING) {
            $view['reservedUntil'] = Transaction::iso($order['reserved_until']);
        }
        if ($order['paid_at'] !== null) {
            $view['paidAt'] = Transaction::iso($order['paid_at']);
        }

        return ['order' => $view + ['items' => $items]];
    }

    /**
     * The buyer is looking at a PENDING order (the payment page polls this). Fulfilment normally comes from Stripe's webhook, but a
     * webhook can be late, mis-addressed or unconfigured, which would leave a paid customer staring at "Confirming your payment". So the
     * server asks Stripe itself (secret key, server to server) and, if the payment really succeeded, applies it through the SAME
     * routine as the webhook (amount and currency are checked, an already paid order is a no-op, so both paths together are safe).
     * Nothing the browser says is trusted. Failure to reach Stripe is not an error here: the next poll tries again.
     */
    private function confirmWithProvider(string $paymentIntentId): void
    {
        try {
            $intent = $this->gateway->retrieveIntent($paymentIntentId);
            if ($intent['status'] !== 'succeeded') {
                Log::debug('payment.sync.pending', 'Stripe says the payment is not complete yet', ['intent' => $paymentIntentId, 'stripe_status' => $intent['status']]);

                return;
            }
            Log::info('payment.sync.succeeded', 'Stripe reports the payment succeeded before any webhook: confirming from the server', ['intent' => $paymentIntentId]);
            $this->payments->handle([
                'id' => 'sync_' . $paymentIntentId,
                'type' => 'payment_intent.succeeded',
                'data' => ['object' => $intent],
            ]);
        } catch (\Throwable $e) {
            Log::error('payment.sync.failed', 'could not ask Stripe about a pending payment (is STRIPE_SECRET_KEY set, and does the server reach api.stripe.com?)', ['intent' => $paymentIntentId, 'error' => $e]);
        }
    }
}
