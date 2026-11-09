<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;

/** @phpstan-type Order array{id: int, user_id: int, status: string, currency: string, total_cents: int, stripe_payment_intent_id: string|null, reserved_until: string, paid_at: string|null, failure_reason: string|null, created_at: string} */
final class OrderRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** The moment a reservation made now ends, by the database clock (UTC), as 'Y-m-d H:i:s'. */
    public function deadline(int $minutes): string
    {
        $stmt = $this->pdo->prepare('SELECT DATE_FORMAT(NOW() + INTERVAL ? MINUTE, ?)');
        $stmt->execute([$minutes, '%Y-%m-%d %H:%i:%s']);

        return (string) $stmt->fetchColumn();
    }

    public function create(int $userId, string $currency, int $totalCents, string $reservedUntil): int
    {
        $this->pdo->prepare('INSERT INTO orders (user_id, currency, total_cents, reserved_until) VALUES (?, ?, ?, ?)')
            ->execute([$userId, $currency, $totalCents, $reservedUntil]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @param list<array{offer_id: int, product_id: int, product_slug: string, product_name: string, seller_name: string, unit_price_cents: int, qty: int}> $items */
    public function addItems(int $orderId, array $items): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO order_items (order_id, offer_id, product_id, product_slug, product_name, seller_name, unit_price_cents, qty) VALUES (?,?,?,?,?,?,?,?)',
        );
        foreach ($items as $item) {
            $stmt->execute([$orderId, $item['offer_id'], $item['product_id'], $item['product_slug'], $item['product_name'], $item['seller_name'], $item['unit_price_cents'], $item['qty']]);
        }
    }

    public function attachPaymentIntent(int $orderId, string $paymentIntentId): void
    {
        $this->pdo->prepare('UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?')->execute([$paymentIntentId, $orderId]);
    }

    /** @return Order|null */
    public function find(int $orderId, bool $forUpdate = false): ?array
    {
        return $this->one('SELECT * FROM orders WHERE id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), [$orderId]);
    }

    /** @return Order|null */
    public function findByPaymentIntent(string $paymentIntentId, bool $forUpdate = false): ?array
    {
        return $this->one('SELECT * FROM orders WHERE stripe_payment_intent_id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), [$paymentIntentId]);
    }

    public function setStatus(int $orderId, string $status, ?string $reason = null): void
    {
        $this->pdo->prepare('UPDATE orders SET status = ?, failure_reason = ? WHERE id = ?')->execute([$status, $reason, $orderId]);
    }

    public function markPaid(int $orderId): void
    {
        $this->pdo->prepare("UPDATE orders SET status = 'paid', paid_at = NOW(), failure_reason = NULL WHERE id = ?")->execute([$orderId]);
    }

    /** @return list<array{offer_id: int, product_id: int, product_slug: string, product_name: string, seller_name: string, unit_price_cents: int, qty: int}> */
    public function items(int $orderId): array
    {
        $stmt = $this->pdo->prepare('SELECT offer_id, product_id, product_slug, product_name, seller_name, unit_price_cents, qty FROM order_items WHERE order_id = ? ORDER BY id');
        $stmt->execute([$orderId]);

        return array_map(static fn (array $r): array => [
            'offer_id' => (int) $r['offer_id'],
            'product_id' => (int) $r['product_id'],
            'product_slug' => (string) $r['product_slug'],
            'product_name' => (string) $r['product_name'],
            'seller_name' => (string) $r['seller_name'],
            'unit_price_cents' => (int) $r['unit_price_cents'],
            'qty' => (int) $r['qty'],
        ], $stmt->fetchAll());
    }

    /** @return list<int> the user's orders that are still waiting for payment */
    public function pendingIdsOfUser(int $userId): array
    {
        $stmt = $this->pdo->prepare("SELECT id FROM orders WHERE user_id = ? AND status = 'pending' ORDER BY id");
        $stmt->execute([$userId]);

        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /** @return list<int> pending orders whose reservation ran out (oldest first, bounded) */
    public function dueIds(?int $userId = null, int $limit = 100): array
    {
        $sql = "SELECT id FROM orders WHERE status = 'pending' AND reserved_until < NOW()" . ($userId !== null ? ' AND user_id = ?' : '') . ' ORDER BY id LIMIT ' . (int) $limit;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($userId !== null ? [$userId] : []);

        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * @return array{rows: list<array{id: int, status: string, total_cents: int, created_at: string, item_count: int}>, total: int}
     */
    public function listForUser(int $userId, int $page, int $pageSize): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.id, o.status, o.total_cents, o.created_at, COALESCE(SUM(i.qty), 0) AS item_count
             FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
             WHERE o.user_id = ?
             GROUP BY o.id, o.status, o.total_cents, o.created_at
             ORDER BY o.created_at DESC, o.id DESC
             LIMIT ? OFFSET ?',
        );
        $stmt->bindValue(1, $userId, PDO::PARAM_INT);
        $stmt->bindValue(2, $pageSize, PDO::PARAM_INT);
        $stmt->bindValue(3, ($page - 1) * $pageSize, PDO::PARAM_INT);
        $stmt->execute();

        $count = $this->pdo->prepare('SELECT COUNT(*) FROM orders WHERE user_id = ?');
        $count->execute([$userId]);

        return [
            'rows' => array_map(static fn (array $r): array => [
                'id' => (int) $r['id'],
                'status' => (string) $r['status'],
                'total_cents' => (int) $r['total_cents'],
                'created_at' => (string) $r['created_at'],
                'item_count' => (int) $r['item_count'],
            ], $stmt->fetchAll()),
            'total' => (int) $count->fetchColumn(),
        ];
    }

    /** Records an event id. False when it was already there, i.e. Stripe is retrying something we handled. */
    public function recordEvent(string $eventId, string $type): bool
    {
        $stmt = $this->pdo->prepare('INSERT IGNORE INTO stripe_events (event_id, type) VALUES (?, ?)');
        $stmt->execute([$eventId, $type]);

        return $stmt->rowCount() === 1;
    }

    /**
     * @param list<mixed> $params
     * @return Order|null
     */
    private function one(string $sql, array $params): ?array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'status' => (string) $row['status'],
            'currency' => (string) $row['currency'],
            'total_cents' => (int) $row['total_cents'],
            'stripe_payment_intent_id' => $row['stripe_payment_intent_id'] === null ? null : (string) $row['stripe_payment_intent_id'],
            'reserved_until' => (string) $row['reserved_until'],
            'paid_at' => $row['paid_at'] === null ? null : (string) $row['paid_at'],
            'failure_reason' => $row['failure_reason'] === null ? null : (string) $row['failure_reason'],
            'created_at' => (string) $row['created_at'],
        ];
    }
}
