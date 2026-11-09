<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\JsonResponse;
use App\Services\CheckoutService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class CheckoutController
{
    public function __construct(private readonly CheckoutService $checkout)
    {
    }

    /** No body: the order is built from the caller's server-side cart. Whatever the client sends cannot change an amount. */
    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::write($response, $this->checkout->checkout((int) $request->getAttribute('user')['id']), 201);
    }
}
