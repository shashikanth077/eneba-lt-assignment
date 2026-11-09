<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;

/**
 * Key inventory. The state machine of one key:  available -> reserved (order_id, reserved_until) -> sold,
 * or reserved -> available again when the reservation is released.
 *
 * Methods that lock rows must be called inside a transaction opened by the caller.
 */
final class KeyRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Locks up to $qty available keys of an offer for this transaction. SKIP LOCKED is the point: if another buyer's
     * open transaction already holds some keys, we do not wait for them (no queue, no deadlock), we simply do not see
     * them, so two buyers can never be handed the same key. Fewer rows than $qty means "not enough stock right now".
     *
     * @return list<int> key ids
     */
    public function lockAvailable(int $offerId, int $qty): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT id FROM game_keys WHERE offer_id = ? AND status = 'available' ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED",
        );
        $stmt->bindValue(1, $offerId, PDO::PARAM_INT);
        $stmt->bindValue(2, $qty, PDO::PARAM_INT);
        $stmt->execute();

        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /** @param list<int> $keyIds keys previously locked by lockAvailable() */
    public function reserve(array $keyIds, int $orderId, string $reservedUntil): void
    {
        if ($keyIds === []) {
            return;
        }
        $marks = implode(',', array_fill(0, count($keyIds), '?'));
        $this->pdo->prepare("UPDATE game_keys SET status = 'reserved', order_id = ?, reserved_until = ? WHERE status = 'available' AND id IN ($marks)")
            ->execute([$orderId, $reservedUntil, ...$keyIds]);
    }

    /** Gives an order's reserved keys back to the shelf. Sold keys are never touched. */
    public function release(int $orderId): int
    {
        $stmt = $this->pdo->prepare("UPDATE game_keys SET status = 'available', order_id = NULL, reserved_until = NULL WHERE order_id = ? AND status = 'reserved'");
        $stmt->execute([$orderId]);

        return $stmt->rowCount();
    }

    /** Reserved -> sold for the whole order. Returns how many keys were sold, so the caller can compare with what it expects. */
    public function sell(int $orderId): int
    {
        $stmt = $this->pdo->prepare("UPDATE game_keys SET status = 'sold', reserved_until = NULL WHERE order_id = ? AND status = 'reserved'");
        $stmt->execute([$orderId]);

        return $stmt->rowCount();
    }

    /** Hands every key of an order back, sold or not. Used only when a paid order cannot be fulfilled and is refunded. */
    public function releaseAll(int $orderId): void
    {
        $this->pdo->prepare("UPDATE game_keys SET status = 'available', order_id = NULL, reserved_until = NULL WHERE order_id = ?")->execute([$orderId]);
    }

    /** @return array<int, int> offer id => keys currently held by the order (reserved or sold) */
    public function heldByOrder(int $orderId): array
    {
        $stmt = $this->pdo->prepare('SELECT offer_id, COUNT(*) AS n FROM game_keys WHERE order_id = ? GROUP BY offer_id');
        $stmt->execute([$orderId]);

        return array_map('intval', array_column($stmt->fetchAll(), 'n', 'offer_id'));
    }

    /**
     * The encrypted keys of an order, grouped by offer. Callers decrypt, and only for paid orders of the owner.
     *
     * @return array<int, list<string>> offer id => encrypted keys
     */
    public function soldKeysOfOrder(int $orderId): array
    {
        $stmt = $this->pdo->prepare("SELECT offer_id, key_enc FROM game_keys WHERE order_id = ? AND status = 'sold' ORDER BY id");
        $stmt->execute([$orderId]);
        $grouped = [];
        foreach ($stmt->fetchAll() as $row) {
            $grouped[(int) $row['offer_id']][] = (string) $row['key_enc'];
        }

        return $grouped;
    }
}
