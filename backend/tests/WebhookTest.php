<?php

declare(strict_types=1);

namespace Tests;

use App\Repositories\CartRepository;
use App\Repositories\KeyRepository;
use App\Repositories\OrderRepository;
use App\Services\OrderLifecycle;
use App\Services\PaymentEventService;
use PHPUnit\Framework\Attributes\DataProvider;

final class WebhookTest extends ShopTestCase
{
    /** @return array{buyer: array{id: int, token: string}, orderId: int, intent: string, total: int} a pending order: 2 x offer 1 + the last key of offer 3 */
    private function pendingOrder(string $email = 'a@example.com'): array
    {
        $buyer = $this->user($email);
        $this->addToCart($buyer['token'], 1, 2);
        $this->addToCart($buyer['token'], 3, 1);
        $order = $this->checkout($buyer['token']);

        return ['buyer' => $buyer, 'orderId' => $order['orderId'], 'intent' => $this->gateway->created[count($this->gateway->created) - 1]['id'], 'total' => $order['totalCents']];
    }

    private function eventCount(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM stripe_events')->fetchColumn();
    }

    // ---- the happy path: paid -> keys sold -> visible to the owner only -------------------------

    public function testASucceededPaymentMarksTheOrderPaidSellsTheKeysAndEmptiesTheBoughtLinesFromTheCart(): void
    {
        $o = $this->pendingOrder();
        $this->addToCart($o['buyer']['token'], 2, 1); // a line that is NOT part of the order... added after checkout

        $response = $this->pay($o['orderId']);

        self::assertSame(['received' => true], $this->json($response));
        $order = $this->orderRow($o['orderId']);
        self::assertSame('paid', $order['status']);
        self::assertNotNull($order['paid_at']);
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1));
        self::assertSame(['sold' => 1], $this->keyStates(3));
        self::assertSame([2], array_column($this->ok('GET', '/api/cart', $o['buyer']['token'])['lines'], 'offerId'), 'only what was bought left the cart');
        self::assertSame(1, $this->eventCount());
    }

    public function testTheOwnerSeesTheDecryptedKeysAndNobodyElseDoes(): void
    {
        $o = $this->pendingOrder();
        $stranger = $this->user('stranger@example.com');
        $before = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order'];
        self::assertArrayNotHasKey('keys', $before['items'][0], 'pending: no keys yet');

        $this->pay($o['orderId']);
        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order'];

        self::assertSame('paid', $order['status']);
        self::assertCount(2, $order['items'][0]['keys']);
        self::assertCount(1, $order['items'][1]['keys']);
        self::assertSame(['KEY-3-1'], $order['items'][1]['keys']);
        self::assertEmpty(array_diff($order['items'][0]['keys'], $this->plainKeys(1)), 'real keys of offer 1');
        self::assertCount(2, array_unique($order['items'][0]['keys']));

        $theirs = $this->call('GET', '/api/orders/' . $o['orderId'], $stranger['token']);
        self::assertSame(404, $theirs->getStatusCode());
        self::assertStringNotContainsString('KEY-', (string) $theirs->getBody());
        self::assertSame(401, $this->send('GET', '/api/orders/' . $o['orderId'])->getStatusCode());
    }

    public function testTheWebhookNeedsNoCookieAndNoCsrfHeader(): void
    {
        $o = $this->pendingOrder();
        $raw = json_encode($this->event('evt_x', 'payment_intent.succeeded', $o['intent'], $o['total']), JSON_THROW_ON_ERROR);

        $response = $this->sendRaw('POST', '/api/webhooks/stripe', $raw, ['Stripe-Signature' => $this->signature($raw)]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('paid', $this->orderRow($o['orderId'])['status']);
    }

    // ---- retries and duplicates ------------------------------------------------------------

    public function testTheSameEventDeliveredAgainChangesNothing(): void
    {
        $o = $this->pendingOrder();
        $this->pay($o['orderId'], 'evt_same');
        $paidAt = $this->orderRow($o['orderId'])['paid_at'];
        $soldKeys = self::$pdo->query("SELECT GROUP_CONCAT(id ORDER BY id) FROM game_keys WHERE status = 'sold'")->fetchColumn();

        for ($i = 0; $i < 3; $i++) {
            self::assertSame(200, $this->pay($o['orderId'], 'evt_same')->getStatusCode());
        }

        self::assertSame($paidAt, $this->orderRow($o['orderId'])['paid_at']);
        self::assertSame($soldKeys, self::$pdo->query("SELECT GROUP_CONCAT(id ORDER BY id) FROM game_keys WHERE status = 'sold'")->fetchColumn());
        self::assertSame(1, $this->eventCount());
    }

    public function testASecondSucceededEventWithAnotherIdForTheSamePaymentIsANoOp(): void
    {
        $o = $this->pendingOrder();
        $this->pay($o['orderId'], 'evt_one');
        $this->pay($o['orderId'], 'evt_two');

        self::assertSame('paid', $this->orderRow($o['orderId'])['status']);
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1), 'no key was sold twice');
        self::assertSame(2, $this->eventCount());
    }

    public function testAFailureInTheMiddleOfProcessingRollsBackEverythingIncludingTheEventRecord(): void
    {
        $o = $this->pendingOrder();
        $event = $this->event('evt_crash', 'payment_intent.succeeded', $o['intent'], $o['total']);
        $pdo = self::countingPdo();
        $pdo->failOnSql = 'DELETE FROM cart_items'; // the LAST step of paying an order, after keys were sold and the order marked paid
        $crashing = new PaymentEventService(
            $pdo,
            new OrderRepository($pdo),
            new KeyRepository($pdo),
            new CartRepository($pdo),
            new OrderLifecycle($pdo, new OrderRepository($pdo), new KeyRepository($pdo), $this->gateway),
            $this->gateway,
        );

        try {
            $crashing->handle($event);
            self::fail('expected the failure to surface (so the webhook answers 5xx and Stripe retries)');
        } catch (\PDOException) {
        }

        self::assertSame(0, $this->eventCount(), 'the event is NOT marked as processed');
        self::assertSame('pending', $this->orderRow($o['orderId'])['status']);
        self::assertSame(['available' => 1, 'reserved' => 2], $this->keyStates(1), 'the half-done "sold" was rolled back');

        $this->pay($o['orderId'], 'evt_crash'); // Stripe's retry, same event id, now succeeds for real
        self::assertSame('paid', $this->orderRow($o['orderId'])['status']);
    }

    // ---- signature -------------------------------------------------------------------------

    public function testBadSignaturesAreRejectedBeforeAnythingHappens(): void
    {
        $o = $this->pendingOrder();
        $raw = json_encode($this->event('evt_bad', 'payment_intent.succeeded', $o['intent'], $o['total']), JSON_THROW_ON_ERROR);
        $attempts = [
            'wrong secret' => $this->signature($raw, 'whsec_somebody_else'),
            'header missing' => '',
            'header is garbage' => 'hello',
            'no v1 part' => 't=' . time(),
            'timestamp too old (replay)' => $this->signature($raw, self::WEBHOOK_SECRET, time() - 3600),
            'signed a different body (tampered)' => $this->signature(str_replace((string) $o['total'], '1', $raw)),
        ];

        foreach ($attempts as $label => $signature) {
            $response = $this->sendRaw('POST', '/api/webhooks/stripe', $raw, $signature === '' ? [] : ['Stripe-Signature' => $signature]);

            self::assertSame(400, $response->getStatusCode(), $label);
            self::assertSame('invalid_signature', $this->json($response)['error']['code'], $label);
        }
        self::assertSame('pending', $this->orderRow($o['orderId'])['status']);
        self::assertSame(0, $this->eventCount());
    }

    public function testAnEventSignedForOneBodyCannotCarryAnother(): void
    {
        $o = $this->pendingOrder();
        $cheapBody = json_encode($this->event('evt_cheap', 'payment_intent.succeeded', $o['intent'], 100), JSON_THROW_ON_ERROR);
        $signatureOfTheRealOne = $this->signature(json_encode($this->event('evt_cheap', 'payment_intent.succeeded', $o['intent'], $o['total']), JSON_THROW_ON_ERROR));

        $response = $this->sendRaw('POST', '/api/webhooks/stripe', $cheapBody, ['Stripe-Signature' => $signatureOfTheRealOne]);

        self::assertSame(400, $response->getStatusCode());
    }

    public function testWithoutAConfiguredSecretNothingIsAccepted(): void
    {
        $o = $this->pendingOrder();
        $previous = $_ENV['STRIPE_WEBHOOK_SECRET'];
        $_ENV['STRIPE_WEBHOOK_SECRET'] = '';
        try {
            $raw = json_encode($this->event('evt_x', 'payment_intent.succeeded', $o['intent'], $o['total']), JSON_THROW_ON_ERROR);
            $response = $this->sendRaw('POST', '/api/webhooks/stripe', $raw, ['Stripe-Signature' => $this->signature($raw, '')]);
        } finally {
            $_ENV['STRIPE_WEBHOOK_SECRET'] = $previous;
        }

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('webhook_not_configured', $this->json($response)['error']['code']);
        self::assertSame('pending', $this->orderRow($o['orderId'])['status']);
    }

    public function testASignedButMalformedPayloadIs400(): void
    {
        foreach (['not json at all', '{"type":"payment_intent.succeeded"}', '[]', '"x"'] as $raw) {
            $response = $this->sendRaw('POST', '/api/webhooks/stripe', $raw, ['Stripe-Signature' => $this->signature($raw)]);

            self::assertSame(400, $response->getStatusCode(), $raw);
        }
    }

    // ---- other events and unknown payments -------------------------------------------------

    public function testEventsWeDoNotCareAboutAreAcknowledged(): void
    {
        $o = $this->pendingOrder();

        $response = $this->webhook($this->event('evt_other', 'charge.refunded', $o['intent'], $o['total']));

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('pending', $this->orderRow($o['orderId'])['status']);
    }

    /** What `stripe trigger payment_intent.succeeded` sends: a genuine, signed event for a payment this shop never created. */
    public function testASucceededPaymentThatBelongsToNoOrderIsAcknowledgedAndIgnored(): void
    {
        $o = $this->pendingOrder();

        $response = $this->webhook($this->event('evt_cli', 'payment_intent.succeeded', 'pi_3FromStripeCliTrigger', 2000));

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('pending', $this->orderRow($o['orderId'])['status'], 'no order was touched');
        self::assertSame(['available' => 1, 'reserved' => 2], $this->keyStates(1));
    }

    public function testTheOrderIdInTheMetadataLinksAPaymentWhoseIntentIdWasNeverSaved(): void
    {
        $o = $this->pendingOrder();
        self::$pdo->exec("UPDATE orders SET stripe_payment_intent_id = NULL WHERE id = {$o['orderId']}"); // e.g. the process died right after Stripe created the intent

        $this->webhook($this->event('evt_meta', 'payment_intent.succeeded', 'pi_created_but_not_saved', $o['total'], 'eur', ['metadata' => ['order_id' => (string) $o['orderId']]]));

        $order = $this->orderRow($o['orderId']);
        self::assertSame('paid', $order['status']);
        self::assertSame('pi_created_but_not_saved', $order['stripe_payment_intent_id']);
    }

    public function testMetadataCannotHijackAnOrderThatAlreadyHasADifferentPayment(): void
    {
        $o = $this->pendingOrder();

        $this->webhook($this->event('evt_hijack', 'payment_intent.succeeded', 'pi_somebody_elses', $o['total'], 'eur', ['metadata' => ['order_id' => (string) $o['orderId']]]));

        self::assertSame('pending', $this->orderRow($o['orderId'])['status']);
    }

    // ---- money that does not match -----------------------------------------------------------

    #[DataProvider('mismatches')]
    public function testAPaymentForTheWrongAmountOrCurrencyIsRefundedNotDelivered(int $amountDelta, string $currency): void
    {
        $o = $this->pendingOrder();

        $this->webhook($this->event('evt_wrong', 'payment_intent.succeeded', $o['intent'], $o['total'] + $amountDelta, $currency));

        $order = $this->orderRow($o['orderId']);
        self::assertSame('refunded', $order['status']);
        self::assertSame('refunded_automatically', $order['failure_reason']);
        self::assertSame([$o['intent']], $this->gateway->refunded);
        self::assertSame(['available' => 3], $this->keyStates(1), 'keys back on the shelf, none delivered');
        self::assertArrayNotHasKey('keys', $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order']['items'][0]);
    }

    /** @return array<string, array{int, string}> */
    public static function mismatches(): array
    {
        return ['too little' => [-1, 'eur'], 'too much' => [+500, 'eur'], 'another currency' => [0, 'usd']];
    }

    public function testWhenTheRefundCallFailsTheOrderStaysMarkedForManualRefund(): void
    {
        $o = $this->pendingOrder();
        $this->gateway->failRefund = true;

        $response = $this->webhook($this->event('evt_wrong', 'payment_intent.succeeded', $o['intent'], $o['total'] + 1));

        self::assertSame(200, $response->getStatusCode(), 'acknowledged: retrying would not help');
        self::assertSame('refund_needed', $this->orderRow($o['orderId'])['status']);
        self::assertSame('amount_mismatch', $this->orderRow($o['orderId'])['failure_reason']);
    }

    // ---- failed and canceled payments --------------------------------------------------------

    public function testAFailedPaymentClosesTheOrderReleasesTheKeysAndCancelsTheIntent(): void
    {
        $o = $this->pendingOrder();

        $this->webhook($this->event('evt_fail', 'payment_intent.payment_failed', $o['intent'], $o['total'], 'eur', ['last_payment_error' => ['message' => 'Your card was declined.']]));

        $order = $this->orderRow($o['orderId']);
        self::assertSame('failed', $order['status']);
        self::assertSame('Your card was declined.', $order['failure_reason']);
        self::assertSame(['available' => 3], $this->keyStates(1));
        self::assertSame(['available' => 1], $this->keyStates(3));
        self::assertSame([$o['intent']], $this->gateway->canceled);
        self::assertCount(2, $this->ok('GET', '/api/cart', $o['buyer']['token'])['lines'], 'the cart is kept so the buyer can try another card');

        $this->checkout($o['buyer']['token']); // a fresh checkout works
    }

    public function testACanceledPaymentClosesTheOrderAndReleasesTheKeys(): void
    {
        $o = $this->pendingOrder();

        $this->webhook($this->event('evt_cancel', 'payment_intent.canceled', $o['intent'], $o['total']));

        self::assertSame('canceled', $this->orderRow($o['orderId'])['status']);
        self::assertSame(['available' => 3], $this->keyStates(1));
    }

    public function testAFailureEventForAnOrderThatIsAlreadyPaidIsIgnored(): void
    {
        $o = $this->pendingOrder();
        $this->pay($o['orderId']);

        $this->webhook($this->event('evt_late_fail', 'payment_intent.payment_failed', $o['intent'], $o['total']));
        $this->webhook($this->event('evt_late_cancel', 'payment_intent.canceled', $o['intent'], $o['total']));

        self::assertSame('paid', $this->orderRow($o['orderId'])['status'], 'events can arrive out of order; paid wins');
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1));
        self::assertSame([], $this->gateway->canceled);
    }

    // ---- payments that arrive late -------------------------------------------------------------

    public function testAPaymentThatSucceedsAfterTheOrderFailedGetsItsKeysAgainWhenTheyAreStillFree(): void
    {
        $o = $this->pendingOrder();
        $this->webhook($this->event('evt_fail', 'payment_intent.payment_failed', $o['intent'], $o['total']));
        self::assertSame(['available' => 3], $this->keyStates(1));

        $this->webhook($this->event('evt_late', 'payment_intent.succeeded', $o['intent'], $o['total']));

        self::assertSame('paid', $this->orderRow($o['orderId'])['status']);
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1));
        self::assertSame(['sold' => 1], $this->keyStates(3));
        self::assertCount(2, $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token'])['order']['items'][0]['keys']);
        self::assertSame([], $this->gateway->refunded);
    }

    public function testAPaymentThatSucceedsAfterExpiryWhileTheKeysWereSoldToSomeoneElseIsRefunded(): void
    {
        $fast = $this->user('fast@example.com');
        $this->addToCart($fast['token'], 3, 1);                 // both buyers want the last key of offer 3
        $slow = $this->pendingOrder('slow@example.com');        // ...the slow one reserves it first (and 2 of offer 1)
        self::$pdo->exec("UPDATE orders SET reserved_until = NOW() - INTERVAL 1 MINUTE WHERE id = {$slow['orderId']}");
        $fastOrder = $this->checkout($fast['token']);          // expires the slow order and takes the last key
        $this->pay($fastOrder['orderId'], 'evt_fast');          // and pays for it
        self::assertSame('expired', $this->orderRow($slow['orderId'])['status']);

        $this->webhook($this->event('evt_slow_late', 'payment_intent.succeeded', $slow['intent'], $slow['total']));

        self::assertSame('refunded', $this->orderRow($slow['orderId'])['status']);
        self::assertContains($slow['intent'], $this->gateway->refunded);
        self::assertSame('paid', $this->orderRow($fastOrder['orderId'])['status'], 'the other buyer is untouched');
        self::assertSame(['KEY-3-1'], $this->ok('GET', '/api/orders/' . $fastOrder['orderId'], $fast['token'])['order']['items'][0]['keys']);
        self::assertSame(['available' => 3], $this->keyStates(1), 'all-or-nothing: the part of the slow order that WAS available was not kept either');
    }

    public function testAPaymentForAnExpiredOrderWhoseKeysAreStillFreeIsFulfilled(): void
    {
        $o = $this->pendingOrder();
        self::$pdo->exec("UPDATE orders SET reserved_until = NOW() - INTERVAL 1 MINUTE WHERE id = {$o['orderId']}");
        self::$pdo->exec("UPDATE game_keys SET reserved_until = NOW() - INTERVAL 1 MINUTE WHERE order_id = {$o['orderId']}");
        $this->ok('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token']); // reading it expires it
        self::assertSame('expired', $this->orderRow($o['orderId'])['status']);

        $this->webhook($this->event('evt_late', 'payment_intent.succeeded', $o['intent'], $o['total']));

        self::assertSame('paid', $this->orderRow($o['orderId'])['status']);
        self::assertSame(['sold' => 1], $this->keyStates(3));
    }

    public function testAnExpiredReservationWhoseKeysWereNeverTakenCanStillBeSoldWhenThePaymentArrives(): void
    {
        $o = $this->pendingOrder();
        self::$pdo->exec("UPDATE orders SET reserved_until = NOW() - INTERVAL 1 MINUTE WHERE id = {$o['orderId']}");
        // nobody ran the cleanup, so the keys are still reserved for this order

        $this->pay($o['orderId']);

        self::assertSame('paid', $this->orderRow($o['orderId'])['status']);
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1));
    }
}
