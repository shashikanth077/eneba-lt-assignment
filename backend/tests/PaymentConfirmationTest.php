<?php

declare(strict_types=1);

namespace Tests;

/**
 * A buyer who has paid must not be left on "Confirming your payment" because Stripe's webhook is late, mis-addressed or not set up:
 * looking at a pending order makes the SERVER ask Stripe what happened and fulfil it the same way the webhook would.
 */
final class PaymentConfirmationTest extends ShopTestCase
{
    /** @return array{token: string, orderId: int, intent: string, total: int} */
    private function pending(): array
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 2);
        $order = $this->checkout($buyer['token']);

        return ['token' => $buyer['token'], 'orderId' => $order['orderId'], 'intent' => $this->gateway->created[count($this->gateway->created) - 1]['id'], 'total' => $order['totalCents']];
    }

    public function testAnOrderStaysPendingWhileStripeSaysThePaymentIsNotDone(): void
    {
        $o = $this->pending();

        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['token'])['order'];

        self::assertSame('pending', $order['status']);
        self::assertSame(['available' => 1, 'reserved' => 2], $this->keyStates(1));
    }

    public function testASucceededPaymentIsConfirmedWithoutAnyWebhook(): void
    {
        $o = $this->pending();
        $this->gateway->statuses[$o['intent']] = 'succeeded';

        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['token'])['order'];

        self::assertSame('paid', $order['status']);
        self::assertCount(2, $order['items'][0]['keys'], 'the keys are delivered by the same routine as the webhook');
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1));
        self::assertSame([], $this->ok('GET', '/api/cart', $o['token'])['lines'], 'what was bought left the cart');
    }

    public function testTheWebhookArrivingLaterChangesNothing(): void
    {
        $o = $this->pending();
        $this->gateway->statuses[$o['intent']] = 'succeeded';
        $this->ok('GET', '/api/orders/' . $o['orderId'], $o['token']);
        $keys = $this->plainKeys(1);

        $this->pay($o['orderId']);
        $again = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['token'])['order'];

        self::assertSame('paid', $again['status']);
        self::assertSame($keys, $this->plainKeys(1), 'no key was sold twice or changed');
        self::assertSame(['available' => 1, 'sold' => 2], $this->keyStates(1));
    }

    public function testRepeatedLooksAtAPaidOrderDoNotCallTheProviderAgain(): void
    {
        $o = $this->pending();
        $this->gateway->statuses[$o['intent']] = 'succeeded';
        $this->ok('GET', '/api/orders/' . $o['orderId'], $o['token']);
        $this->gateway->failRetrieve = true; // if it were asked again, the fake would fail loudly (logged)

        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['token'])['order'];

        self::assertSame('paid', $order['status']);
    }

    public function testAProviderOutageIsNotAnErrorForTheBuyer(): void
    {
        $o = $this->pending();
        $this->gateway->failRetrieve = true;

        $order = $this->ok('GET', '/api/orders/' . $o['orderId'], $o['token'])['order'];

        self::assertSame('pending', $order['status'], 'the next poll tries again');
    }

    public function testSomebodyElsesOrderIsNotConfirmedForThem(): void
    {
        $o = $this->pending();
        $this->gateway->statuses[$o['intent']] = 'succeeded';
        $stranger = $this->user('stranger@example.com');

        $this->fails('GET', '/api/orders/' . $o['orderId'], $stranger['token'], 404, 'not_found');

        self::assertSame('pending', $this->orderRow($o['orderId'])['status'], 'a stranger asking changes nothing');
    }
}
