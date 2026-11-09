<?php

declare(strict_types=1);

namespace App\Payment;

use App\Exceptions\ApiException;
use Stripe\Exception\SignatureVerificationException;
use Stripe\WebhookSignature;

/**
 * Proves a webhook really comes from Stripe: the Stripe-Signature header carries `t=<timestamp>,v1=<HMAC-SHA256>` of
 * "<timestamp>.<raw body>" made with the endpoint secret. It must be checked against the RAW body, byte for byte,
 * and the timestamp must be recent (replay protection). Anything else is rejected before a single query runs.
 */
final class StripeWebhookVerifier
{
    public function __construct(private readonly string $secret, private readonly int $toleranceSeconds = 300)
    {
    }

    /**
     * @return array<string, mixed> the decoded event
     * @throws ApiException 400 invalid_signature | 503 webhook_not_configured
     */
    public function verify(string $rawBody, string $signatureHeader): array
    {
        if ($this->secret === '') {
            throw new ApiException(503, 'webhook_not_configured', 'Webhook signing secret is not configured');
        }
        try {
            WebhookSignature::verifyHeader($rawBody, $signatureHeader, $this->secret, $this->toleranceSeconds);
        } catch (SignatureVerificationException) {
            throw new ApiException(400, 'invalid_signature', 'Invalid webhook signature');
        }

        $event = json_decode($rawBody, true);
        if (!is_array($event) || !isset($event['id'], $event['type']) || !is_string($event['id']) || !is_string($event['type'])) {
            throw new ApiException(400, 'invalid_payload', 'Malformed event');
        }

        return $event;
    }
}
