<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;

/** The server-side cart: only (user, offer, qty) is stored; names, prices and stock are always read live. */
final class CartRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * One statement for the whole cart (no query per line). `available` is the live number of available keys.
     *
     * @return list<array{offer_id: int, qty: int, active: bool, price_cents: int, product_id: int, product_slug: string, product_name: string, seller_name: string, available: int}>
     */
    public function lines(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT c.offer_id, c.qty, o.active, o.price_cents, p.id AS product_id, p.slug AS product_slug, p.name AS product_name, s.name AS seller_name,
                    (SELECT COUNT(*) FROM game_keys k WHERE k.offer_id = o.id AND k.status = 'available') AS available
             FROM cart_items c
             JOIN offers o ON o.id = c.offer_id
             JOIN products p ON p.id = o.product_id
             JOIN sellers s ON s.id = o.seller_id
             WHERE c.user_id = ?
             ORDER BY c.id",
        );
        $stmt->execute([$userId]);

        return array_map(static fn (array $r): array => [
            'offer_id' => (int) $r['offer_id'],
            'qty' => (int) $r['qty'],
            'active' => (bool) $r['active'],
            'price_cents' => (int) $r['price_cents'],
            'product_id' => (int) $r['product_id'],
            'product_slug' => (string) $r['product_slug'],
            'product_name' => (string) $r['product_name'],
            'seller_name' => (string) $r['seller_name'],
            'available' => (int) $r['available'],
        ], $stmt->fetchAll());
    }

    /** @return array{active: bool, available: int}|null null when the offer does not exist */
    public function offerStock(int $offerId): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT o.active, (SELECT COUNT(*) FROM game_keys k WHERE k.offer_id = o.id AND k.status = 'available') AS available FROM offers o WHERE o.id = ?",
        );
        $stmt->execute([$offerId]);
        $row = $stmt->fetch();

        return $row === false ? null : ['active' => (bool) $row['active'], 'available' => (int) $row['available']];
    }

    public function qtyOf(int $userId, int $offerId): ?int
    {
        $stmt = $this->pdo->prepare('SELECT qty FROM cart_items WHERE user_id = ? AND offer_id = ?');
        $stmt->execute([$userId, $offerId]);
        $qty = $stmt->fetchColumn();

        return $qty === false ? null : (int) $qty;
    }

    public function lineCount(int $userId): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM cart_items WHERE user_id = ?');
        $stmt->execute([$userId]);

        return (int) $stmt->fetchColumn();
    }

    public function setQty(int $userId, int $offerId, int $qty): void
    {
        $this->pdo->prepare('INSERT INTO cart_items (user_id, offer_id, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = VALUES(qty)')
            ->execute([$userId, $offerId, $qty]);
    }

    public function remove(int $userId, int $offerId): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM cart_items WHERE user_id = ? AND offer_id = ?');
        $stmt->execute([$userId, $offerId]);

        return $stmt->rowCount() > 0;
    }

    public function clear(int $userId): void
    {
        $this->pdo->prepare('DELETE FROM cart_items WHERE user_id = ?')->execute([$userId]);
    }

    /** @param list<int> $offerIds */
    public function removeOffers(int $userId, array $offerIds): void
    {
        if ($offerIds === []) {
            return;
        }
        $marks = implode(',', array_fill(0, count($offerIds), '?'));
        $this->pdo->prepare("DELETE FROM cart_items WHERE user_id = ? AND offer_id IN ($marks)")->execute([$userId, ...$offerIds]);
    }
}
