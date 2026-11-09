<?php

declare(strict_types=1);

namespace App\Http;

use App\Exceptions\ApiException;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Exception\HttpException;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;
use PDOException;
use Throwable;

/**
 * The single place where any exception becomes the API error format:
 * {"error": {"code": string, "message": string, "details": object|null}}
 */
final class JsonErrorHandler
{
    /** MySQL client/server codes meaning "cannot connect or authenticate". */
    private const DB_CONNECTION_CODES = [1044, 1045, 1049, 2002, 2003, 2006, 2013];

    public function __construct(
        private readonly ResponseFactoryInterface $responses,
        private readonly bool $debug,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, Throwable $e): ResponseInterface
    {
        $response = $this->responses->createResponse();

        if ($e instanceof ApiException) {
            return JsonResponse::error($response, $e->status(), $e->errorCode(), $e->getMessage(), $e->details());
        }
        if ($e instanceof HttpNotFoundException) {
            return JsonResponse::error($response, 404, 'not_found', 'Resource not found');
        }
        if ($e instanceof HttpMethodNotAllowedException) {
            return JsonResponse::error($response, 405, 'method_not_allowed', 'Method not allowed', [
                'allowed' => $e->getAllowedMethods(),
            ]);
        }
        if ($e instanceof HttpException) {
            return JsonResponse::error($response, $e->getCode(), 'http_error', $e->getMessage());
        }

        if ($e instanceof PDOException && in_array((int) $e->getCode(), self::DB_CONNECTION_CODES, true)) {
            error_log('[db] connection problem: ' . $e->getMessage());

            return JsonResponse::error($response, 503, 'db_unavailable', 'Database is not reachable');
        }

        // Unexpected: log the real cause, never leak it unless debugging.
        error_log(sprintf('[unhandled] %s: %s in %s:%d', $e::class, $e->getMessage(), $e->getFile(), $e->getLine()));
        $details = $this->debug
            ? ['exception' => $e::class, 'message' => $e->getMessage(), 'trace' => explode("\n", $e->getTraceAsString())]
            : null;

        return JsonResponse::error($response, 500, 'internal_error', 'Something went wrong on our side', $details);
    }
}
