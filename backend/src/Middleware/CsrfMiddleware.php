<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Exceptions\ApiException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use App\Support\Log;

/**
 * CSRF defence for a cookie-authenticated API, on top of SameSite=Lax:
 *  - every state-changing request must carry "X-Requested-With: fetch" (a cross-site form cannot set it),
 *  - if the browser sends an Origin, it must be one of ours.
 */
final class CsrfMiddleware implements MiddlewareInterface
{
    private const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

    /**
     * @param list<string> $allowedOrigins
     * @param list<string> $exemptPaths e.g. the Stripe webhook, which is authenticated by signature instead
     */
    public function __construct(private readonly array $allowedOrigins, private readonly array $exemptPaths = [])
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (
            in_array($request->getMethod(), self::SAFE_METHODS, true)
            || in_array($request->getUri()->getPath(), $this->exemptPaths, true)
        ) {
            return $handler->handle($request);
        }

        $origin = $request->getHeaderLine('Origin');
        if ($request->getHeaderLine('X-Requested-With') !== 'fetch'
            || ($origin !== '' && !in_array($origin, $this->allowedOrigins, true))) {
            Log::warn('security.csrf.rejected', 'state-changing request refused: missing X-Requested-With header or an origin that is not allowed (is APP_URL exactly the address in the browser?)', ['origin' => $origin, 'has_header' => $request->getHeaderLine('X-Requested-With') === 'fetch', 'path' => $request->getUri()->getPath()]);
            throw new ApiException(403, 'csrf_rejected', 'Request rejected');
        }

        return $handler->handle($request);
    }
}
