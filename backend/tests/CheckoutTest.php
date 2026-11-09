<?php

declare(strict_types=1);

namespace Tests;

final class CheckoutTest extends ShopTestCase
{
    public function testCheckoutCreatesAPendingOrderReservesKeysAndStartsAPaymentForTheServersAmount(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 2);
        $this->addToCart($buyer['token'], 3, 1);

        $result = $this->ok('POST', '/api/checkout', $buyer['token'], ['totalCents' => 1, 'amount' => 1, 'price' => 1], 201);

        self::assertSame(['orderId', 'clientSecret', 'totalCents', 'currency', 'reservedUntil'], array_keys($result));
        self::assertSame(2 * 1000 + 2500, $result['totalCents'], 'recomputed on the server; the amounts in the body were ignored');
        self::assertSame('EUR', $result['currency']);
        self::assertSame($this->gateway->created[0]['id'] . '_secret_x', $result['clientSecret']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $result['reservedUntil']);

        // what the provider was asked: exactly the server's amount, tagged with the order, idempotent per order
        self::assertCount(1, $this->gateway->created);
        self::assertSame(
            ['amount' => 4500, 'currency' => 'eur', 'orderId' => $result['orderId'], 'idempotencyKey' => 'order-' . $result['orderId']],
            array_intersect_key($this->gateway->created[0], array_flip(['amount', 'currency', 'orderId', 'idempotencyKey'])),
        );

        $order = $this->orderRow($result['orderId']);
        self::assertSame('pending', $order['status']);
        self::assertSame($this->gateway->created[0]['id'], $order['stripe_payment_intent_id']);
        self::assertSame(['available' => 1, 'reserved' => 2], $this->keyStates(1));
        self::assertSame(['reserved' => 1], $this->keyStates(3));
        self::assertEqualsWithDelta(15 * 60, strtotime($order['reserved_until'] . ' UTC') - time(), 5, 'reserved for 15 minutes');

        $items = self::$pdo->query("SELECT offer_id, product_name, seller_name, unit_price_cents, qty FROM order_items WHERE order_id = {$result['orderId']} ORDER BY offer_id")->fetchAll();
        self::assertSame([['offer_id' => 1, 'product_name' => 'Alpha', 'seller_name' => 'Seller One', 'unit_price_cents' => 1000, 'qty' => 2], ['offer_id' => 3, 'product_name' => 'Bravo', 'seller_name' => 'Seller One', 'unit_price_cents' => 2500, 'qty' => 1]], array_map(static fn (array $r): array => array_map(static fn ($v) => is_numeric($v) ? (int) $v : $v, $r), $items));
    }

    public function testTheCartStaysUntilPaymentSucceeds(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 1);

        $this->checkout($buyer['token']);

        self::assertCount(1, $this->ok('GET', '/api/cart', $buyer['token'])['lines']);
    }

    public function testAnEmptyCartCannotCheckOut(): void
    {
        $buyer = $this->user('a@example.com');

        $this->fails('POST', '/api/checkout', $buyer['token'], 422, 'cart_empty');
        self::assertSame([], $this->gateway->created);
    }

    public function testThePriceAtCheckoutIsTheCurrentPriceNotWhatTheCartOnceShowed(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 1);
        self::$pdo->exec('UPDATE offers SET price_cents = 1337 WHERE id = 1');

        $result = $this->checkout($buyer['token']);

        self::assertSame(1337, $result['totalCents']);
        self::assertSame(1337, $this->gateway->created[0]['amount']);
        self::assertSame(1337, (int) self::$pdo->query("SELECT unit_price_cents FROM order_items WHERE order_id = {$result['orderId']}")->fetchColumn());
    }

    public function testAnOrderBelowTheProviderMinimumIsRefusedBeforeAnyKeyIsReserved(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 4, 1); // 0.20

        $this->fails('POST', '/api/checkout', $buyer['token'], 422, 'amount_too_small');

        self::assertSame(['available' => 5], $this->keyStates(4));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn());
    }

    public function testOutOfStockMidCheckoutIsAllOrNothingAndNamesEveryProblemLine(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 2);
        $this->addToCart($buyer['token'], 3, 1);
        $this->addToCart($buyer['token'], 2, 2);
        // between "add to cart" and "pay": offer 3 is bought out elsewhere, offer 2 is withdrawn
        self::$pdo->exec("UPDATE game_keys SET status = 'sold' WHERE offer_id = 3");
        self::$pdo->exec('UPDATE offers SET active = 0 WHERE id = 2');

        $error = $this->fails('POST', '/api/checkout', $buyer['token'], 409, 'out_of_stock');

        self::assertEqualsCanonicalizing(
            [['offerId' => 2, 'code' => 'inactive', 'requested' => 2, 'available' => 0], ['offerId' => 3, 'code' => 'out_of_stock', 'requested' => 1, 'available' => 0]],
            $error['details']['items'],
        );
        self::assertSame(['available' => 3], $this->keyStates(1), 'the line that WAS in stock was not reserved either');
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn(), 'no order row');
        self::assertSame([], $this->gateway->created, 'the provider was never asked');
        self::assertCount(3, $this->ok('GET', '/api/cart', $buyer['token'])['lines'], 'the cart is untouched so the buyer can fix it');
    }

    public function testAPartiallyAvailableLineReportsHowManyAreLeft(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 3);
        self::$pdo->exec("UPDATE game_keys SET status = 'sold' WHERE offer_id = 1 AND id IN (SELECT i FROM (SELECT id i FROM game_keys WHERE offer_id = 1 ORDER BY id LIMIT 2) t)");

        $error = $this->fails('POST', '/api/checkout', $buyer['token'], 409, 'out_of_stock');

        self::assertSame([['offerId' => 1, 'code' => 'out_of_stock', 'requested' => 3, 'available' => 1]], $error['details']['items']);
    }

    public function testAProviderFailureReleasesTheKeysAndClosesTheOrder(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 2);
        $this->gateway->failCreate = true;

        $this->fails('POST', '/api/checkout', $buyer['token'], 502, 'payment_provider_error');

        self::assertSame(['available' => 3], $this->keyStates(1), 'keys are back on the shelf');
        $order = self::$pdo->query('SELECT status, failure_reason FROM orders')->fetch();
        self::assertSame(['status' => 'failed', 'failure_reason' => 'payment_provider_error'], $order);

        $this->gateway->failCreate = false;
        $this->checkout($buyer['token']); // and the buyer can simply try again
        self::assertSame(['available' => 1, 'reserved' => 2], $this->keyStates(1));
    }

    public function testWithoutStripeKeysCheckoutAnswers503AndReleasesTheKeys(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 1);
        $this->containerOverrides = []; // the real container: STRIPE_SECRET_KEY is empty in the test environment

        $this->fails('POST', '/api/checkout', $buyer['token'], 503, 'payments_unavailable');

        self::assertSame(['available' => 3], $this->keyStates(1));
    }

    public function testStartingCheckoutAgainReplacesTheEarlierPendingOrderInsteadOfHoardingStock(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 2);
        $first = $this->checkout($buyer['token']);

        $second = $this->checkout($buyer['token']);

        self::assertNotSame($first['orderId'], $second['orderId']);
        self::assertSame('canceled', $this->orderRow($first['orderId'])['status']);
        self::assertSame('pending', $this->orderRow($second['orderId'])['status']);
        self::assertSame(['available' => 1, 'reserved' => 2], $this->keyStates(1), 'still only 2 keys held, not 4');
        self::assertSame([$this->gateway->created[0]['id']], $this->gateway->canceled, 'the old payment was canceled at the provider');
    }

    public function testAnExpiredReservationIsReleasedAndItsKeysCanBeBoughtByAnotherBuyer(): void
    {
        $slow = $this->user('slow@example.com');
        $fast = $this->user('fast@example.com');
        $this->addToCart($slow['token'], 3, 1); // the last key
        $this->addToCart($fast['token'], 3, 1); // both carts hold it; only one checkout can get it
        $slowOrder = $this->checkout($slow['token']);

        $this->fails('POST', '/api/checkout', $fast['token'], 409, 'out_of_stock'); // held by the slow buyer

        self::$pdo->exec("UPDATE orders SET reserved_until = NOW() - INTERVAL 1 MINUTE WHERE id = {$slowOrder['orderId']}");
        self::$pdo->exec("UPDATE game_keys SET reserved_until = NOW() - INTERVAL 1 MINUTE WHERE order_id = {$slowOrder['orderId']}");

        $fastOrder = $this->checkout($fast['token']); // reclaims the key

        self::assertSame('expired', $this->orderRow($slowOrder['orderId'])['status']);
        self::assertSame('reservation_expired', $this->orderRow($slowOrder['orderId'])['failure_reason']);
        self::assertSame('pending', $this->orderRow($fastOrder['orderId'])['status']);
        self::assertSame(['reserved' => 1], $this->keyStates(3));
        self::assertSame((int) $fastOrder['orderId'], (int) self::$pdo->query('SELECT order_id FROM game_keys WHERE offer_id = 3')->fetchColumn());
        self::assertContains($this->gateway->created[0]['id'], $this->gateway->canceled, "the slow buyer's payment was canceled so it cannot succeed later");
    }

    public function testAReservationThatIsNotYetDueIsLeftAlone(): void
    {
        $slow = $this->user('slow@example.com');
        $fast = $this->user('fast@example.com');
        $this->addToCart($slow['token'], 3, 1);
        $this->addToCart($fast['token'], 3, 1);
        $this->checkout($slow['token']);

        $this->fails('POST', '/api/checkout', $fast['token'], 409, 'out_of_stock');

        self::assertSame([], $this->gateway->canceled);
    }

    public function testTheCartRefusesTheLastKeyWhileAnotherBuyerHoldsIt(): void
    {
        $holder = $this->user('holder@example.com');
        $late = $this->user('late@example.com');
        $this->addToCart($holder['token'], 3, 1);
        $this->checkout($holder['token']);

        $error = $this->fails('POST', '/api/cart', $late['token'], 409, 'insufficient_stock', ['offerId' => 3, 'qty' => 1]);

        self::assertSame(['offerId' => 3, 'available' => 0], $error['details']);
    }

    public function testCheckoutNeedsTheCsrfHeader(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 1);

        $response = $this->send('POST', '/api/checkout', null, $buyer['token'], headers: ['X-Requested-With' => '']);

        self::assertSame(403, $response->getStatusCode());
        self::assertSame([], $this->gateway->created);
    }
}
