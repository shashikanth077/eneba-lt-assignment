<?php

declare(strict_types=1);

namespace Tests;

use App\Payment\PaymentGateway;
use App\Payment\PaymentGatewayException;

/** Records what the shop asks the payment provider to do; can be told to fail. */
final class FakePaymentGateway implements PaymentGateway
{
    /** @var list<array{amount: int, currency: string, orderId: int, idempotencyKey: string, id: string}> */
    public array $created = [];
    /** @var list<string> */
    public array $canceled = [];
    /** @var list<string> */
    public array $refunded = [];
    /** @var array<string, string> payment intent id => status the fake provider reports (default requires_payment_method) */
    public array $statuses = [];
    public bool $failRetrieve = false;
    public bool $failCreate = false;
    public bool $failCancel = false;
    public bool $failRefund = false;

    public function createIntent(int $amountCents, string $currency, int $orderId, string $idempotencyKey): array
    {
        if ($this->failCreate) {
            throw new PaymentGatewayException('fake: provider down');
        }
        $id = 'pi_fake_' . (count($this->created) + 1) . '_' . $orderId;
        $this->created[] = ['amount' => $amountCents, 'currency' => $currency, 'orderId' => $orderId, 'idempotencyKey' => $idempotencyKey, 'id' => $id];

        return ['id' => $id, 'clientSecret' => $id . '_secret_x'];
    }

    public function retrieveIntent(string $paymentIntentId): array
    {
        if ($this->failRetrieve) {
            throw new PaymentGatewayException('fake: provider down');
        }
        $order = null;
        foreach ($this->created as $created) {
            if ($created['id'] === $paymentIntentId) {
                $order = $created;
            }
        }
        $status = $this->statuses[$paymentIntentId] ?? 'requires_payment_method';

        return [
            'id' => $paymentIntentId,
            'status' => $status,
            'amount' => $order['amount'] ?? 0,
            'amount_received' => $status === 'succeeded' ? ($order['amount'] ?? 0) : 0,
            'currency' => $order['currency'] ?? 'eur',
        ];
    }

    public function cancelIntent(string $paymentIntentId): void
    {
        $this->canceled[] = $paymentIntentId;
        if ($this->failCancel) {
            throw new PaymentGatewayException('fake: cannot cancel');
        }
    }

    public function refund(string $paymentIntentId): void
    {
        if ($this->failRefund) {
            throw new PaymentGatewayException('fake: cannot refund');
        }
        $this->refunded[] = $paymentIntentId;
    }
}
