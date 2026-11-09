<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Orders\OrderStatus;
use App\Repositories\KeyRepository;
use App\Repositories\OrderRepository;
use App\Support\KeyCipher;
use App\Support\Transaction;

/** Order history and detail. Keys are decrypted here and only here, and only for a PAID order of the CALLER. */
final class OrderService
{
    public function __construct(
        private readonly OrderRepository $orders,
        private readonly KeyRepository $keys,
        private readonly KeyCipher $cipher,
        private readonly OrderLifecycle $lifecycle,
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
}
