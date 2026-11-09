<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Catalog\ProductFilters;
use App\Catalog\ProductSort;
use App\Exceptions\ValidationException;
use App\Http\JsonResponse;
use App\Services\CatalogService;
use App\Services\SearchService;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class CatalogController
{
    private const DEFAULT_PAGE_SIZE = 24;
    private const MAX_PAGE_SIZE = 48;
    private const MAX_QUERY_LENGTH = 100;

    public function __construct(
        private readonly CatalogService $catalog,
        private readonly SearchService $search,
    ) {
    }

    /** GET /api/products: browse, optionally narrowed by a text query `q` (then sortable by relevance). */
    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->listing($request, $response, requireQuery: false);
    }

    /** GET /api/search: same engine as /api/products?q=, but the query is mandatory. */
    public function search(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->listing($request, $response, requireQuery: true);
    }

    /** GET /api/search/suggest?q=: autocomplete, best 6, empty list below 2 characters. */
    public function suggest(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = Validator::validate($request->getQueryParams(), ['q' => 'string|max:' . self::MAX_QUERY_LENGTH]);

        return JsonResponse::write($response, $this->catalog->suggestions($this->search->suggest($input['q'] ?? '')));
    }

    public function filters(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $input = Validator::validate($query, ['q' => 'string|max:' . self::MAX_QUERY_LENGTH]);
        $filters = ProductFilters::fromQuery($query);
        if (isset($input['q'])) {
            $filters = $filters->withSearch(array_keys($this->search->rank($input['q'])));
        }

        return JsonResponse::write($response, $this->catalog->filters($filters));
    }

    public function show(ResponseInterface $response, string $slug): ResponseInterface
    {
        return JsonResponse::write($response, $this->catalog->show($slug));
    }

    private function listing(ServerRequestInterface $request, ResponseInterface $response, bool $requireQuery): ResponseInterface
    {
        $query = $request->getQueryParams();
        $input = Validator::validate($query, [
            'q' => ($requireQuery ? 'required|' : '') . 'string|max:' . self::MAX_QUERY_LENGTH,
            'sort' => 'in:' . implode(',', ProductSort::values()),
            'page' => 'int|min:1|max:100000',
            'pageSize' => 'int|min:1|max:' . self::MAX_PAGE_SIZE,
        ]);
        $filters = ProductFilters::fromQuery($query);

        $q = $input['q'] ?? null;
        $sort = isset($input['sort']) ? ProductSort::from($input['sort']) : ($q !== null ? ProductSort::Relevance : ProductSort::Popular);
        if ($sort === ProductSort::Relevance && $q === null) {
            throw new ValidationException(['sort' => ['relevance needs a search query (q)']]);
        }

        $scores = [];
        if ($q !== null) {
            $scores = $this->search->rank($q);
            $filters = $filters->withSearch(array_keys($scores));
        }

        return JsonResponse::write($response, $this->catalog->list(
            $filters,
            $sort,
            (int) ($input['page'] ?? 1),
            (int) ($input['pageSize'] ?? self::DEFAULT_PAGE_SIZE),
            $scores,
        ));
    }
}
