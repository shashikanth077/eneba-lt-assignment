<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Exceptions\ValidationException;
use App\Repositories\CartRepository;

/** The buyer's cart. Prices, names and stock are read live on every call, nothing price-like is ever taken from the client. */
final class CartService
{
    public const MAX_QTY_PER_LINE = 5;
    public const MAX_LINES = 20;

    public function __construct(private readonly CartRepository $cart, private readonly string $currency)
    {
    }

    /**
     * @return array{lines: list<array<string, mixed>>, totalCents: int, currency: string, issues: list<array<string, mixed>>}
     */
    public function view(int $userId): array
    {
        $lines = [];
        $issues = [];
        $total = 0;
        foreach ($this->cart->lines($userId) as $row) {
            $lineCents = $row['price_cents'] * $row['qty'];
            $total += $lineCents;
            $lines[] = [
                'offerId' => $row['offer_id'],
                'productSlug' => $row['product_slug'],
                'productName' => $row['product_name'],
                'sellerName' => $row['seller_name'],
                'unitCents' => $row['price_cents'],
                'qty' => $row['qty'],
                'lineCents' => $lineCents,
                'available' => $row['available'],
            ];
            if (!$row['active']) {
                $issues[] = ['offerId' => $row['offer_id'], 'code' => 'inactive', 'message' => 'This offer is no longer available'];
            } elseif ($row['available'] === 0) {
                $issues[] = ['offerId' => $row['offer_id'], 'code' => 'out_of_stock', 'message' => 'Out of stock'];
            } elseif ($row['qty'] > $row['available']) {
                $issues[] = ['offerId' => $row['offer_id'], 'code' => 'insufficient_stock', 'message' => 'Only ' . $row['available'] . ' left'];
            }
        }

        return ['lines' => $lines, 'totalCents' => $total, 'currency' => strtoupper($this->currency), 'issues' => $issues];
    }

    /** Adds $qty to the line (creating it if needed). */
    public function add(int $userId, int $offerId, int $qty): array
    {
        $this->assertQty($qty);
        $current = $this->cart->qtyOf($userId, $offerId);
        if ($current === null && $this->cart->lineCount($userId) >= self::MAX_LINES) {
            throw new ApiException(422, 'cart_full', 'The cart holds at most ' . self::MAX_LINES . ' different items');
        }

        return $this->store($userId, $offerId, ($current ?? 0) + $qty);
    }

    /** Sets the quantity of an existing line. */
    public function setQuantity(int $userId, int $offerId, int $qty): array
    {
        $this->assertQty($qty);
        if ($this->cart->qtyOf($userId, $offerId) === null) {
            throw ApiException::notFound('That item is not in your cart');
        }

        return $this->store($userId, $offerId, $qty);
    }

    public function remove(int $userId, int $offerId): array
    {
        if (!$this->cart->remove($userId, $offerId)) {
            throw ApiException::notFound('That item is not in your cart');
        }

        return $this->view($userId);
    }

    public function clear(int $userId): array
    {
        $this->cart->clear($userId);

        return $this->view($userId);
    }

    private function store(int $userId, int $offerId, int $qty): array
    {
        if ($qty > self::MAX_QTY_PER_LINE) {
            throw new ValidationException(['qty' => ['At most ' . self::MAX_QTY_PER_LINE . ' of the same offer per order']]);
        }
        $stock = $this->cart->offerStock($offerId);
        if ($stock === null || !$stock['active']) {
            throw ApiException::notFound('Offer not found');
        }
        if ($qty > $stock['available']) {
            throw ApiException::conflict('insufficient_stock', $stock['available'] === 0 ? 'Out of stock' : 'Only ' . $stock['available'] . ' left', [
                'offerId' => $offerId,
                'available' => $stock['available'],
            ]);
        }
        $this->cart->setQty($userId, $offerId, $qty);

        return $this->view($userId);
    }

    private function assertQty(int $qty): void
    {
        if ($qty < 1) {
            throw new ValidationException(['qty' => ['Must be at least 1']]);
        }
    }
}
