<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\JsonResponse;
use App\Services\OrderService;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class OrderController
{
    private const DEFAULT_PAGE_SIZE = 20;

    public function __construct(private readonly OrderService $orders)
    {
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = Validator::validate($request->getQueryParams(), ['page' => 'int|min:1|max:100000', 'pageSize' => 'int|min:1|max:50']);

        return JsonResponse::write($response, $this->orders->list(
            (int) $request->getAttribute('user')['id'],
            (int) ($query['page'] ?? 1),
            (int) ($query['pageSize'] ?? self::DEFAULT_PAGE_SIZE),
        ));
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        return JsonResponse::write($response, $this->orders->get((int) $request->getAttribute('user')['id'], ctype_digit($id) ? (int) $id : 0));
    }
}
