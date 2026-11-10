<?php

declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Headers every API response gets, errors included (this is the outermost middleware).
 *
 *  - Cache-Control: no-store unless the handler chose something itself (the artwork endpoints do). The API returns carts, orders and,
 *    on a paid order, the plain-text game keys. Without an explicit instruction a browser may keep such a response on disk, serve it from
 *    the back/forward cache after sign-out, and a CDN or proxy in front of the API (the production setup has one) may keep it for others.
 *  - nosniff, DENY framing and no referrer: cheap, standard hardening for a JSON API.
 *  - HSTS only when the deployment is HTTPS (the cookie is Secure); browsers ignore it over plain HTTP anyway.
 */
final class SecurityHeadersMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly bool $https)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request)
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('X-Frame-Options', 'DENY')
            ->withHeader('Referrer-Policy', 'no-referrer');

        if (!$response->hasHeader('Cache-Control')) {
            $response = $response->withHeader('Cache-Control', 'no-store')->withHeader('Pragma', 'no-cache');
        }
        if ($this->https) {
            $response = $response->withHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
