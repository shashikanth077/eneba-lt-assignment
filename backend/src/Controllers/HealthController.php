<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\JsonResponse;
use App\Services\HealthService;
use Psr\Http\Message\ResponseInterface;

final class HealthController
{
    public function __construct(private readonly HealthService $health)
    {
    }

    public function show(ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::write($response, $this->health->check());
    }
}
