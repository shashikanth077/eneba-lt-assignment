<?php

declare(strict_types=1);

namespace App\Payment;

use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/** Stripe in test mode (sk_test_... key): PaymentIntents, cancel and refund. */
final class StripePaymentGateway implements PaymentGateway
{
    private readonly StripeClient $stripe;

    public function __construct(string $secretKey)
    {
        $this->stripe = new StripeClient($secretKey);
    }

    public function createIntent(int $amountCents, string $currency, int $orderId, string $idempotencyKey): array
    {
        try {
            $intent = $this->stripe->paymentIntents->create(
                [
                    'amount' => $amountCents,
                    'currency' => strtolower($currency),
                    'automatic_payment_methods' => ['enabled' => true],
                    // lets the webhook find the order even if saving the intent id on our side ever fails
                    'metadata' => ['order_id' => (string) $orderId],
                ],
                ['idempotency_key' => $idempotencyKey],
            );
        } catch (ApiErrorException $e) {
            throw new PaymentGatewayException('Stripe could not create the payment: ' . $e->getMessage(), 0, $e);
        }
        $secret = isset($intent->client_secret) ? $intent->client_secret : null;
        if (!is_string($secret) || $secret === '') {
            throw new PaymentGatewayException('Stripe returned no client secret');
        }

        return ['id' => $intent->id, 'clientSecret' => $secret];
    }

    public function retrieveIntent(string $paymentIntentId): array
    {
        try {
            $intent = $this->stripe->paymentIntents->retrieve($paymentIntentId);
        } catch (ApiErrorException $e) {
            throw new PaymentGatewayException('Stripe could not look up the payment: ' . $e->getMessage(), 0, $e);
        }

        return [
            'id' => (string) $intent->id,
            'status' => (string) $intent->status,
            'amount' => (int) $intent->amount,
            'amount_received' => (int) ($intent->amount_received ?? 0),
            'currency' => (string) $intent->currency,
        ];
    }

    public function cancelIntent(string $paymentIntentId): void
    {
        try {
            $this->stripe->paymentIntents->cancel($paymentIntentId);
        } catch (ApiErrorException $e) {
            throw new PaymentGatewayException('Stripe could not cancel the payment: ' . $e->getMessage(), 0, $e);
        }
    }

    public function refund(string $paymentIntentId): void
    {
        try {
            $this->stripe->refunds->create(['payment_intent' => $paymentIntentId], ['idempotency_key' => 'refund-' . $paymentIntentId]);
        } catch (ApiErrorException $e) {
            throw new PaymentGatewayException('Stripe could not refund the payment: ' . $e->getMessage(), 0, $e);
        }
    }
}
