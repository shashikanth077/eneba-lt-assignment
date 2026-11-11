<?php

declare(strict_types=1);

namespace App\Payment;

use App\Exceptions\ApiException;
use App\Support\Log;

/** Used when STRIPE_SECRET_KEY is not set: the shop runs, but starting a payment answers a clear 503. */
final class UnconfiguredPaymentGateway implements PaymentGateway
{
    public function createIntent(int $amountCents, string $currency, int $orderId, string $idempotencyKey): array
    {
        Log::error('checkout.payments.unconfigured', 'a checkout was attempted but STRIPE_SECRET_KEY is not set on this server', ['setting' => 'STRIPE_SECRET_KEY']);
        throw new ApiException(503, 'payments_unavailable', 'Payments are not configured on this server');
    }

    public function retrieveIntent(string $paymentIntentId): array
    {
        throw new PaymentGatewayException('Stripe is not configured');
    }

    public function cancelIntent(string $paymentIntentId): void
    {
        throw new PaymentGatewayException('Stripe is not configured');
    }

    public function refund(string $paymentIntentId): void
    {
        throw new PaymentGatewayException('Stripe is not configured');
    }
}
