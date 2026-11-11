<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Support\ClientIp;
use App\Support\Log;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * The outermost middleware: gives every request an id (the caller's X-Request-Id if it is sane, else a new one), puts it on every log
 * line and on the response, and writes ONE line when the request is finished: method, path (no query string, no body), status, time.
 * 5xx is an error, 4xx a warning, the rest info (the health check is only logged at debug level, monitors call it constantly).
 */
final class RequestLogMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly int $trustedProxies)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $incoming = $request->getHeaderLine('X-Request-Id');
        $id = preg_match('/^[A-Za-z0-9._-]{8,64}$/', $incoming) === 1 ? $incoming : bin2hex(random_bytes(8));
        Log::reset();
        Log::addContext('request_id', $id);
        // the platforms' own ids, so a line here can be matched with the platform's request log
        foreach (['x-vercel-id' => 'vercel_id', 'x-railway-request-id' => 'railway_id'] as $header => $field) {
            if ($request->getHeaderLine($header) !== '') {
                Log::addContext($field, $request->getHeaderLine($header));
            }
        }

        $started = microtime(true);
        $response = $handler->handle($request);
        $status = $response->getStatusCode();
        $path = $request->getUri()->getPath();

        $fields = [
            'method' => $request->getMethod(),
            'path' => $path,
            'status' => $status,
            'ms' => (int) round((microtime(true) - $started) * 1000),
            'ip' => ClientIp::from($request, $this->trustedProxies),
        ];
        $message = $request->getMethod() . ' ' . $path . ' -> ' . $status;
        if ($status >= 500) {
            Log::error('http.request', $message, $fields);
        } elseif ($status >= 400) {
            Log::warn('http.request', $message, $fields);
        } elseif (str_ends_with($path, '/api/health')) {
            Log::debug('http.request', $message, $fields);
        } else {
            Log::info('http.request', $message, $fields);
        }

        return $response->withHeader('X-Request-Id', $id);
    }
}
