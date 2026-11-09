<?php

declare(strict_types=1);

namespace Tests;

final class OrderTest extends ShopTestCase
{
    /** @return array{buyer: array{id: int, token: string}, orderId: int, intent: string, total: int} */
    private function order(string $email, int $offerId = 1, int $qty = 1): array
    {
        $buyer = $this->user($email);
        $this->addToCart($buyer['token'], $offerId, $qty);
        $order = $this->checkout($buyer['token']);

        return ['buyer' => $buyer, 'orderId' => $order['orderId'], 'intent' => $this->gateway->created[count($this->gateway->created) - 1]['id'], 'total' => $order['totalCents']];
    }

    public function testAnEmptyOrderHistory(): void
    {
        $buyer = $this->user('a@example.com');

        self::assertSame(['items' => [], 'page' => 1, 'pageSize' => 20, 'total' => 0], $this->ok('GET', '/api/orders', $buyer['token']));
    }

    public function testTheListShowsOnlyMyOrdersNewestFirstWithoutKeys(): void
    {
        $a = $this->user('a@example.com');
        $b = $this->user('b@example.com');
        $this->addToCart($a['token'], 1, 2);
        $first = $this->checkout($a['token']);
        $this->pay($first['orderId']);
        $this->addToCart($a['token'], 2, 1);
        $second = $this->checkout($a['token']);
        $this->addToCart($b['token'], 1, 1);
        $theirs = $this->checkout($b['token']);

        $list = $this->ok('GET', '/api/orders', $a['token']);

        self::assertSame([$second['orderId'], $first['orderId']], array_column($list['items'], 'id'), 'newest first, nothing of B');
        self::assertNotContains($theirs['orderId'], array_column($list['items'], 'id'));
        self::assertSame(['id', 'status', 'totalCents', 'createdAt', 'itemCount'], array_keys($list['items'][0]));
        self::assertSame(['pending', 'paid'], array_column($list['items'], 'status'));
        self::assertSame([1, 2], array_column($list['items'], 'itemCount'));
        self::assertSame([1200, 2000], array_column($list['items'], 'totalCents'));
        self::assertSame(2, $list['total']);
        self::assertStringNotContainsString('KEY-', (string) json_encode($list), 'the list never carries keys, not even for paid orders');
    }

    public function testListPagination(): void
    {
        $buyer = $this->user('a@example.com');
        $ids = [];
        for ($i = 0; $i < 3; $i++) {
            $this->ok('DELETE', '/api/cart', $buyer['token']);
            $this->addToCart($buyer['token'], 1, 1);
            $ids[] = $this->checkout($buyer['token'])['orderId']; // each checkout replaces the previous pending one
        }

        $page1 = $this->ok('GET', '/api/orders?pageSize=2&page=1', $buyer['token']);
        $page2 = $this->ok('GET', '/api/orders?pageSize=2&page=2', $buyer['token']);
        $page3 = $this->ok('GET', '/api/orders?pageSize=2&page=3', $buyer['token']);

        self::assertSame(array_reverse($ids), [...array_column($page1['items'], 'id'), ...array_column($page2['items'], 'id')]);
        self::assertSame([], $page3['items']);
        self::assertSame(3, $page1['total']);
        self::assertSame(422, $this->call('GET', '/api/orders?page=0', $buyer['token'])->getStatusCode());
        self::assertSame(422, $this->call('GET', '/api/orders?pageSize=51', $buyer['token'])->getStatusCode());
    }

    public function testAPendingOrderShowsItsDeadlineAndNoKeys(): void
    {
        $o = $this->order('a@example.com', 1, 2);

        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order'];

        self::assertSame(['id', 'status', 'totalCents', 'currency', 'createdAt', 'reservedUntil', 'items'], array_keys($order));
        self::assertSame(['pending', 2000, 'EUR'], [$order['status'], $order['totalCents'], $order['currency']]);
        self::assertSame(
            [['productSlug' => 'alpha', 'productName' => 'Alpha', 'sellerName' => 'Seller One', 'unitPriceCents' => 1000, 'qty' => 2]],
            $order['items'],
        );
    }

    public function testAPaidOrderShowsOneDecryptedKeyPerUnitAndNoDeadline(): void
    {
        $o = $this->order('a@example.com', 1, 2);
        $this->pay($o['orderId']);

        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order'];

        self::assertSame(['id', 'status', 'totalCents', 'currency', 'createdAt', 'paidAt', 'items'], array_keys($order));
        self::assertSame('paid', $order['status']);
        self::assertCount(2, $order['items'][0]['keys']);
        foreach ($order['items'][0]['keys'] as $key) {
            self::assertMatchesRegularExpression('/^KEY-1-\d$/', $key, 'plaintext, decrypted on the way out');
        }
        self::assertSame(
            2,
            (int) self::$pdo->query("SELECT COUNT(*) FROM game_keys WHERE order_id = {$o['orderId']} AND status = 'sold'")->fetchColumn(),
            'exactly the keys shown are the ones sold to this order',
        );
        self::assertStringNotContainsString('KEY-', (string) self::$pdo->query("SELECT GROUP_CONCAT(key_enc) FROM game_keys")->fetchColumn(), 'and at rest they are encrypted');
    }

    public function testKeysAreNeverShownForAnOrderThatIsNotPaid(): void
    {
        $statuses = ['pending', 'failed', 'expired', 'canceled', 'refund_needed', 'refunded'];
        foreach ($statuses as $i => $status) {
            $o = $this->order("buyer$i@example.com", 1, 1);
            self::$pdo->exec("UPDATE orders SET status = '$status' WHERE id = {$o['orderId']}");
            self::$pdo->exec("UPDATE game_keys SET status = 'sold' WHERE order_id = {$o['orderId']}"); // even if keys were (wrongly) attached and sold

            $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order'];

            self::assertArrayNotHasKey('keys', $order['items'][0], "status $status");
            self::assertStringNotContainsString('KEY-', (string) json_encode($order), "status $status");
            self::$pdo->exec("UPDATE game_keys SET status = 'available', order_id = NULL WHERE order_id = {$o['orderId']}");
        }
    }

    public function testSomeoneElsesOrderAndUnknownOrdersAreIndistinguishable404s(): void
    {
        $o = $this->order('a@example.com');
        $this->pay($o['orderId']);
        $stranger = $this->user('stranger@example.com');

        $theirs = $this->fails('GET', '/api/orders/' . $o['orderId'], $stranger['token'], 404, 'not_found');
        $unknown = $this->fails('GET', '/api/orders/99999', $stranger['token'], 404, 'not_found');
        $garbage = $this->fails('GET', '/api/orders/abc', $stranger['token'], 404, 'not_found');

        self::assertSame($theirs, $unknown, 'same answer, so order ids cannot be probed');
        self::assertSame($theirs, $garbage);
    }

    public function testAPendingOrderPastItsDeadlineReadsAsExpiredAndItsKeysAreReleased(): void
    {
        $o = $this->order('a@example.com', 3, 1);
        self::$pdo->exec("UPDATE orders SET reserved_until = NOW() - INTERVAL 1 SECOND WHERE id = {$o['orderId']}");

        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order'];

        self::assertSame('expired', $order['status']);
        self::assertArrayNotHasKey('reservedUntil', $order);
        self::assertSame(['available' => 1], $this->keyStates(3));
        self::assertSame([$o['intent']], $this->gateway->canceled);
        self::assertSame('expired', $this->ok('GET', '/api/orders', $o['buyer']['token'])['items'][0]['status'], 'the list agrees');
    }

    public function testTotalsAreASnapshotUnaffectedByLaterPriceChanges(): void
    {
        $o = $this->order('a@example.com', 1, 2);
        $this->pay($o['orderId']);

        self::$pdo->exec('UPDATE offers SET price_cents = 99999 WHERE id = 1');
        self::$pdo->exec("UPDATE products SET name = 'Renamed' WHERE id = 1");

        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order'];
        self::assertSame(2000, $order['totalCents']);
        self::assertSame(['Alpha', 1000], [$order['items'][0]['productName'], $order['items'][0]['unitPriceCents']]);
    }
}
