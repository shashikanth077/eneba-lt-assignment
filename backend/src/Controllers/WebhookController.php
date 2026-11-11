<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\JsonResponse;
use App\Payment\StripeWebhookVerifier;
use App\Services\PaymentEventService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use App\Support\Log;
use App\Exceptions\ApiException;

final class WebhookController
{
    public function __construct(
        private readonly StripeWebhookVerifier $verifier,
        private readonly PaymentEventService $events,
    ) {
    }

    /**
     * Authenticated by Stripe's signature, not by a cookie (so it is exempt from the CSRF header check, see bootstrap).
     * 200 = "handled, do not retry" (including events we ignore and repeats); an exception becomes 4xx/5xx and Stripe retries.
     */
    public function stripe(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $event = $this->verifier->verify((string) $request->getBody(), $request->getHeaderLine('Stripe-Signature'));
        } catch (ApiException $e) {
            // not_configured: STRIPE_WEBHOOK_SECRET is missing here. invalid_signature: the secret differs from the one of the endpoint in
            // Stripe's dashboard (each endpoint has its own), the body was altered, or the request did not come from Stripe.
            $level = $e->errorCode() === 'webhook_not_configured' ? 'error' : 'warn';
            Log::$level('webhook.rejected', 'Stripe webhook refused: ' . $e->errorCode(), ['reason' => $e->errorCode(), 'has_signature_header' => $request->hasHeader('Stripe-Signature')]);
            throw $e;
        }
        Log::info('webhook.received', 'Stripe webhook verified', ['event_id' => $event['id'] ?? '?', 'type' => $event['type'] ?? '?']);
        $outcome = $this->events->handle($event);
        $level = match ($outcome) {
            'refund_needed' => 'error',
            'unknown_order', 'failed', 'canceled' => 'warn',
            default => 'info',
        };
        Log::$level('webhook.handled', 'Stripe event processed: ' . $outcome, ['event_id' => $event['id'] ?? '?', 'type' => $event['type'] ?? '?', 'outcome' => $outcome]);

        return JsonResponse::write($response, ['received' => true]);
    }
}
