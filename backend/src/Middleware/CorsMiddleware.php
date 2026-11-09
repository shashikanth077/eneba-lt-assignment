<?php

declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Production uses a same-origin Vercel rewrite so CORS is not needed there;
 * this exists for local setups where the SPA and API run on different origins.
 * Only origins listed in CORS_ALLOWED_ORIGINS get headers (credentials allowed).
 */
final class CorsMiddleware implements MiddlewareInterface
{
    /** @param list<string> $allowedOrigins */
    public function __construct(
        private readonly ResponseFactoryInterface $responses,
        private readonly array $allowedOrigins,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $origin = $request->getHeaderLine('Origin');
        $isPreflight = $request->getMethod() === 'OPTIONS' && $request->hasHeader('Access-Control-Request-Method');

        $response = $isPreflight ? $this->responses->createResponse(204) : $handler->handle($request);

        if ($origin === '' || !in_array($origin, $this->allowedOrigins, true)) {
            return $response;
        }

        $response = $response
            ->withHeader('Access-Control-Allow-Origin', $origin)
            ->withHeader('Access-Control-Allow-Credentials', 'true')
            ->withAddedHeader('Vary', 'Origin');

        if ($isPreflight) {
            $response = $response
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
                ->withHeader('Access-Control-Max-Age', '600');
        }

        return $response;
    }
}
