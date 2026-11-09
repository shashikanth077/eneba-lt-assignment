<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\JsonResponse;
use App\Payment\StripeWebhookVerifier;
use App\Services\PaymentEventService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

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
        $event = $this->verifier->verify((string) $request->getBody(), $request->getHeaderLine('Stripe-Signature'));
        $this->events->handle($event);

        return JsonResponse::write($response, ['received' => true]);
    }
}
