<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Support\ClientIp;
use App\Support\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use App\Support\Log;

/**
 * Applies one named limit to a route. The subject is the signed-in user when the route is behind AuthMiddleware (limits that protect
 * stock follow the ACCOUNT, not the address), otherwise the client IP as ClientIp resolves it.
 */
final class RateLimitMiddleware implements MiddlewareInterface
{
    /** @param \Closure(): RateLimiter $limiter resolved on first use, so registering the route never opens a database connection */
    public function __construct(
        private readonly \Closure $limiter,
        private readonly string $bucket,
        private readonly int $limit,
        private readonly int $windowSeconds,
        private readonly int $trustedProxies,
        private readonly bool $perUser = false,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $user = $request->getAttribute('user');
        $subject = $this->perUser && is_array($user)
            ? 'u' . $user['id']
            : ClientIp::from($request, $this->trustedProxies);
        try {
            ($this->limiter)()->hit($this->bucket, $subject, $this->limit, $this->windowSeconds);
        } catch (\App\Exceptions\ApiException $e) {
            Log::warn('security.rate_limited', 'too many requests: answered 429', ['bucket' => $this->bucket, 'subject' => $subject]);
            throw $e;
        }

        return $handler->handle($request);
    }
}
