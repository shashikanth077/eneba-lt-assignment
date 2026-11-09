<?php

declare(strict_types=1);

namespace Tests;

use PDO;

/**
 * Two buyers competing for the last key, for real.
 *
 *  - The interleaving tests use two database connections inside ONE process and control the order step by step.
 *  - The race tests start separate OS processes (separate connections) that fire at the same wall-clock instant.
 */
final class ConcurrencyTest extends ShopTestCase
{
    // ---- deterministic interleaving ----------------------------------------------------------

    public function testABuyerDoesNotWaitForAnotherBuyersLockOnTheLastKeyHeSimplyDoesNotGetIt(): void
    {
        $late = $this->user('late@example.com');
        $this->addToCart($late['token'], 3, 1);

        // Buyer A (a separate connection) is in the middle of its checkout transaction and holds a lock on the last key.
        $a = self::countingPdo();
        $a->beginTransaction();
        $locked = (new \App\Repositories\KeyRepository($a))->lockAvailable(3, 1);
        self::assertCount(1, $locked, 'A got the key');

        $started = microtime(true);
        $error = $this->fails('POST', '/api/checkout', $late['token'], 409, 'out_of_stock'); // buyer B, meanwhile
        $waited = microtime(true) - $started;

        self::assertLessThan(2.0, $waited, 'SKIP LOCKED: B was answered at once instead of queueing behind A (innodb_lock_wait_timeout is 50 s)');
        self::assertSame([['offerId' => 3, 'code' => 'out_of_stock', 'requested' => 1, 'available' => 0]], $error['details']['items']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn(), 'B left no trace');

        $a->rollBack(); // A gives up (e.g. its card form was abandoned): the key is free again
        $this->checkout($late['token']);
        self::assertSame(['reserved' => 1], $this->keyStates(3));
    }

    public function testWhenAHolderCommitsTheOtherBuyerIsToldOutOfStockAndNoKeyIsDoubleReserved(): void
    {
        $first = $this->user('first@example.com');
        $second = $this->user('second@example.com');
        $this->addToCart($first['token'], 3, 1);
        $this->addToCart($second['token'], 3, 1);

        $won = $this->checkout($first['token']);
        $this->fails('POST', '/api/checkout', $second['token'], 409, 'out_of_stock');

        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM game_keys WHERE offer_id = 3 AND status = 'reserved'")->fetchColumn());
        self::assertSame($won['orderId'], (int) self::$pdo->query('SELECT order_id FROM game_keys WHERE offer_id = 3')->fetchColumn());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn());
    }

    public function testASecondBuyerStillGetsTheKeysTheFirstOneDidNotTake(): void
    {
        $a = $this->user('a@example.com');
        $b = $this->user('b@example.com');
        $this->addToCart($a['token'], 1, 2);
        $this->addToCart($b['token'], 1, 1);

        // A holds 2 of the 3 keys of offer 1 in an open transaction; B wants 1 and must get the remaining one.
        $conn = self::countingPdo();
        $conn->beginTransaction();
        self::assertCount(2, (new \App\Repositories\KeyRepository($conn))->lockAvailable(1, 2));

        $order = $this->checkout($b['token']);
        $conn->rollBack();

        self::assertSame(['available' => 2, 'reserved' => 1], $this->keyStates(1));
        self::assertSame(1000, $order['totalCents']);
    }

    // ---- real parallel processes -------------------------------------------------------------

    public function testEightBuyersRaceForThreeKeysExactlyThreeWinAndNoKeyIsReservedTwice(): void
    {
        $buyers = [];
        for ($i = 0; $i < 8; $i++) {
            $buyer = $this->user("buyer$i@example.com");
            $this->addToCart($buyer['token'], 1, 1); // offer 1 has 3 keys
            $buyers[] = $buyer['id'];
        }

        $results = $this->race(array_map(static fn (int $id): array => ['checkout', (string) $id], $buyers));

        $winners = array_filter($results, static fn (array $r): bool => $r['ok']);
        $losers = array_filter($results, static fn (array $r): bool => !$r['ok']);
        self::assertCount(3, $winners, json_encode($results, JSON_THROW_ON_ERROR));
        self::assertSame(['out_of_stock'], array_values(array_unique(array_column($losers, 'code'))), 'the 5 others were told out of stock, nothing crashed or deadlocked');

        self::assertSame(['reserved' => 3], $this->keyStates(1));
        self::assertSame(3, (int) self::$pdo->query('SELECT COUNT(DISTINCT order_id) FROM game_keys WHERE offer_id = 1')->fetchColumn(), 'each key belongs to a different order');
        self::assertSame(3, (int) self::$pdo->query("SELECT COUNT(*) FROM orders WHERE status = 'pending'")->fetchColumn());
        self::assertSame(3, (int) self::$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn(), 'losers created no order');
        self::assertEqualsCanonicalizing(array_column($winners, 'orderId'), array_map('intval', self::$pdo->query('SELECT id FROM orders')->fetchAll(PDO::FETCH_COLUMN)));
    }

    public function testTwoBuyersRaceForTheLastKeyRepeatedlyExactlyOneWinsEveryTime(): void
    {
        $a = $this->user('a@example.com');
        $b = $this->user('b@example.com');
        $this->addToCart($a['token'], 3, 1);
        $this->addToCart($b['token'], 3, 1);

        for ($round = 1; $round <= 6; $round++) {
            self::$pdo->exec("DELETE FROM order_items");
            self::$pdo->exec("UPDATE game_keys SET status = 'available', order_id = NULL, reserved_until = NULL WHERE offer_id = 3");
            self::$pdo->exec('DELETE FROM orders');

            $results = $this->race([['checkout', (string) $a['id']], ['checkout', (string) $b['id']]]);

            self::assertSame(1, count(array_filter($results, static fn (array $r): bool => $r['ok'])), "round $round: " . json_encode($results, JSON_THROW_ON_ERROR));
            self::assertSame(['out_of_stock'], array_column(array_filter($results, static fn (array $r): bool => !$r['ok']), 'code'), "round $round");
            self::assertSame(['reserved' => 1], $this->keyStates(3), "round $round");
            self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn(), "round $round");
        }
    }

    public function testBuyersWithOverlappingMultiLineCartsInOppositeOrderNeverDeadlockAndNeverOversell(): void
    {
        $users = [];
        for ($i = 0; $i < 6; $i++) {
            $buyer = $this->user("multi$i@example.com");
            // half add offer 1 first, half offer 2 first: the classic recipe for a lock-order deadlock
            $order = $i % 2 === 0 ? [1, 2] : [2, 1];
            foreach ($order as $offer) {
                $this->addToCart($buyer['token'], $offer, 1);
            }
            $users[] = $buyer['id'];
        }

        $results = $this->race(array_map(static fn (int $id): array => ['checkout', (string) $id], $users));

        self::assertNotContains('exception', array_column($results, 'code'), 'no deadlock or lock-wait timeout: ' . json_encode($results, JSON_THROW_ON_ERROR));
        $winners = array_filter($results, static fn (array $r): bool => $r['ok']);
        self::assertGreaterThanOrEqual(1, count($winners));
        self::assertLessThanOrEqual(2, count($winners), 'offer 2 has only 2 keys');
        self::assertSame(count($winners), (int) self::$pdo->query("SELECT COUNT(*) FROM game_keys WHERE offer_id = 1 AND status = 'reserved'")->fetchColumn());
        self::assertSame(count($winners), (int) self::$pdo->query("SELECT COUNT(*) FROM game_keys WHERE offer_id = 2 AND status = 'reserved'")->fetchColumn());
        self::assertSame(count($winners), (int) self::$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn());
        self::assertSame(
            0,
            (int) self::$pdo->query("SELECT COUNT(*) FROM (SELECT order_id FROM game_keys WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(DISTINCT offer_id) < 2) t")->fetchColumn(),
            'every winning order got BOTH of its lines (all-or-nothing)',
        );
    }

    public function testTheSameWebhookDeliveredByFiveProcessesAtOnceIsAppliedOnce(): void
    {
        $order = $this->pendingOrder();
        $file = $this->eventFile($this->event('evt_dup', 'payment_intent.succeeded', $order['intent'], $order['total']));

        $results = $this->race(array_fill(0, 5, ['event', $file]));
        @unlink($file);

        $outcomes = array_count_values(array_column($results, 'outcome'));
        self::assertEquals(['paid' => 1, 'duplicate' => 4], $outcomes, json_encode($results, JSON_THROW_ON_ERROR));
        self::assertSame('paid', $this->orderRow($order['orderId'])['status']);
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1));
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM stripe_events')->fetchColumn());
    }

    public function testFiveDifferentEventsForTheSamePaymentAtOnceDeliverTheKeysOnce(): void
    {
        $order = $this->pendingOrder();
        $files = [];
        foreach (range(1, 5) as $i) {
            $files[] = $this->eventFile($this->event("evt_variant_$i", 'payment_intent.succeeded', $order['intent'], $order['total']));
        }

        $results = $this->race(array_map(static fn (string $f): array => ['event', $f], $files));
        array_map('unlink', $files);

        self::assertEquals(['paid' => 1, 'already_handled' => 4], array_count_values(array_column($results, 'outcome')), json_encode($results, JSON_THROW_ON_ERROR));
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1));
        self::assertSame(['sold' => 1], $this->keyStates(3));
    }

    public function testAPaymentRacingTheExpiryCleanupNeverDeliversTheLastKeyToTwoBuyers(): void
    {
        for ($round = 1; $round <= 4; $round++) {
            $this->setUp(); // fresh fixture each round
            $fast = $this->user('fast@example.com');
            $this->addToCart($fast['token'], 3, 1);
            $slow = $this->pendingOrder('slow@example.com');          // holds the last key...
            self::$pdo->exec("UPDATE orders SET reserved_until = NOW() - INTERVAL 1 MINUTE WHERE id = {$slow['orderId']}"); // ...but ran out of time
            $file = $this->eventFile($this->event("evt_race_$round", 'payment_intent.succeeded', $slow['intent'], $slow['total']));

            // the slow buyer's payment arrives at the very moment the fast buyer checks out (which reclaims expired keys)
            $results = $this->race([['event', $file], ['checkout', (string) $fast['id']]]);
            @unlink($file);

            self::assertNotContains('exception', array_column($results, 'code'), "round $round: " . json_encode($results, JSON_THROW_ON_ERROR));
            $holder = (int) self::$pdo->query('SELECT order_id FROM game_keys WHERE offer_id = 3')->fetchColumn();
            $slowStatus = $this->orderRow($slow['orderId'])['status'];
            $fastOrders = self::$pdo->query("SELECT id, status FROM orders WHERE user_id = {$fast['id']}")->fetchAll();

            if ($slowStatus === 'paid') {                                  // payment won the race
                self::assertSame($slow['orderId'], $holder, "round $round: the key went to the payer");
                self::assertSame([], $fastOrders, "round $round: the fast buyer was told out of stock");
            } else {                                                       // cleanup won: the late payment had to be refunded
                self::assertContains($slowStatus, ['refunded', 'refund_needed'], "round $round: " . json_encode($results, JSON_THROW_ON_ERROR));
                self::assertCount(1, $fastOrders, "round $round");
                self::assertSame((int) $fastOrders[0]['id'], $holder, "round $round: the key went to the fast buyer, never to both");
            }
        }
    }

    // ---- helpers -----------------------------------------------------------------------------

    /** @return array{buyer: array{id: int, token: string}, orderId: int, intent: string, total: int} */
    private function pendingOrder(string $email = 'a@example.com'): array
    {
        $buyer = $this->user($email);
        $this->addToCart($buyer['token'], 1, 2);
        $this->addToCart($buyer['token'], 3, 1);
        $order = $this->checkout($buyer['token']);

        return ['buyer' => $buyer, 'orderId' => $order['orderId'], 'intent' => $this->gateway->created[count($this->gateway->created) - 1]['id'], 'total' => $order['totalCents']];
    }

    /** @param array<string, mixed> $event */
    private function eventFile(array $event): string
    {
        $file = tempnam(sys_get_temp_dir(), 'keymart-event-');
        file_put_contents($file, json_encode($event, JSON_THROW_ON_ERROR));

        return $file;
    }

    /**
     * Starts one OS process per job and lets them all fire at the same wall-clock instant.
     *
     * @param list<array{0: string, 1: string}> $jobs [mode, argument]
     * @return list<array<string, mixed>> one decoded JSON result per job, in job order
     */
    private function race(array $jobs): array
    {
        $startAt = microtime(true) + 1.5 + 0.12 * count($jobs); // enough for every process to boot and connect first
        $running = [];
        foreach ($jobs as $i => [$mode, $arg]) {
            $process = proc_open(
                [PHP_BINARY, __DIR__ . '/bin/shop_race.php', $mode, $arg, sprintf('%.6F', $startAt), (string) $_ENV['DB_NAME']],
                [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                $pipes,
            );
            self::assertIsResource($process);
            $running[$i] = [$process, $pipes];
        }

        $results = [];
        foreach ($running as $i => [$process, $pipes]) {
            $out = trim((string) stream_get_contents($pipes[1]));
            $err = trim((string) stream_get_contents($pipes[2]));
            proc_close($process);
            $line = (string) array_slice(explode("\n", $out), -1)[0];
            $decoded = json_decode($line, true);
            self::assertIsArray($decoded, "racer $i printed no result. stdout: $out stderr: $err");
            $results[$i] = $decoded;
        }

        return $results;
    }
}
