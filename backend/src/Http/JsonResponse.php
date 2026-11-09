<?php

declare(strict_types=1);

namespace App\Http;

use Psr\Http\Message\ResponseInterface;

final class JsonResponse
{
    public static function write(ResponseInterface $response, mixed $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @param array<string, mixed>|null $details */
    public static function error(
        ResponseInterface $response,
        int $status,
        string $code,
        string $message,
        ?array $details = null,
    ): ResponseInterface {
        return self::write($response, ['error' => ['code' => $code, 'message' => $message, 'details' => $details]], $status);
    }
}
