<?php

declare(strict_types=1);

namespace App\Payment;

/**
 * Everything the shop needs from a payment provider. The checkout code only knows this interface, so tests run with
 * a fake and the Stripe details stay in one class.
 */
interface PaymentGateway
{
    /**
     * Starts a payment of exactly $amountCents. The idempotency key makes a retry of the same call return the same
     * intent instead of creating a second one.
     *
     * @return array{id: string, clientSecret: string}
     * @throws PaymentGatewayException
     */
    public function createIntent(int $amountCents, string $currency, int $orderId, string $idempotencyKey): array;

    /**
     * Asks the provider (server to server, with the secret key) what really happened to a payment. This is how an order is confirmed
     * when the webhook has not arrived, without ever trusting the browser.
     *
     * @return array{id: string, status: string, amount: int, amount_received: int, currency: string}
     * @throws PaymentGatewayException
     */
    public function retrieveIntent(string $paymentIntentId): array;

    /** Stops a payment that was not completed, so it can no longer succeed after we released the keys. */
    public function cancelIntent(string $paymentIntentId): void;

    /** Gives the money of a succeeded payment back (used when the keys could not be delivered). */
    public function refund(string $paymentIntentId): void;
}
