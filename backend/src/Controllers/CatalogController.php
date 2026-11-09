<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Catalog\ProductFilters;
use App\Catalog\ProductSort;
use App\Http\JsonResponse;
use App\Services\CatalogService;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class CatalogController
{
    private const DEFAULT_PAGE_SIZE = 24;
    private const MAX_PAGE_SIZE = 48;

    public function __construct(private readonly CatalogService $catalog)
    {
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $paging = Validator::validate($query, [
            'sort' => 'in:' . implode(',', ProductSort::values()),
            'page' => 'int|min:1|max:100000',
            'pageSize' => 'int|min:1|max:' . self::MAX_PAGE_SIZE,
        ]);

        return JsonResponse::write($response, $this->catalog->list(
            ProductFilters::fromQuery($query),
            ProductSort::from($paging['sort'] ?? ProductSort::Popular->value),
            (int) ($paging['page'] ?? 1),
            (int) ($paging['pageSize'] ?? self::DEFAULT_PAGE_SIZE),
        ));
    }

    public function filters(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::write($response, $this->catalog->filters(ProductFilters::fromQuery($request->getQueryParams())));
    }

    public function show(ResponseInterface $response, string $slug): ResponseInterface
    {
        return JsonResponse::write($response, $this->catalog->show($slug));
    }
}
