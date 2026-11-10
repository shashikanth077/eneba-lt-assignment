<?php

declare(strict_types=1);

namespace App\Services;

use App\Catalog\ProductFilters;
use App\Catalog\ProductSort;
use App\Exceptions\ApiException;
use App\Repositories\ProductRepository;

/** Turns repository rows into the API shapes documented in docs/ARCHITECTURE.md (section 3). */
final class CatalogService
{
    public function __construct(private readonly ProductRepository $products)
    {
    }

    /**
     * @param array<int, float> $scores product id => search score; when given, every item also carries its "score"
     * @return array{items: list<array<string, mixed>>, page: int, pageSize: int, total: int}
     */
    public function list(ProductFilters $filters, ProductSort $sort, int $page, int $pageSize, array $scores = []): array
    {
        $result = $this->products->list($filters, $sort, $page, $pageSize);

        return [
            'items' => array_map(function (array $row) use ($scores): array {
                $card = $this->card($row);

                return isset($scores[$row['id']]) ? $card + ['score' => $scores[$row['id']]] : $card;
            }, $result['rows']),
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => $result['total'],
        ];
    }

    /**
     * Autocomplete: the best matches, lighter than a card.
     *
     * @param array<int, float> $ranked product id => score, best first (already limited)
     * @return array{suggestions: list<array<string, mixed>>}
     */
    public function suggestions(array $ranked): array
    {
        if ($ranked === []) {
            return ['suggestions' => []];
        }
        $rows = $this->products->list(
            (new ProductFilters())->withSearch(array_keys($ranked)),
            ProductSort::Relevance,
            1,
            count($ranked),
        )['rows'];

        return ['suggestions' => array_map(static fn (array $row): array => [
            'slug' => $row['slug'],
            'name' => $row['name'],
            'coverUrl' => '/api/images/products/' . $row['slug'] . '.svg',
            'platform' => ['slug' => $row['platform_slug'], 'name' => $row['platform_name']],
            'inStock' => $row['in_stock'],
            'score' => $ranked[$row['id']],
        ], $rows)];
    }

    /** @return array<string, mixed> */
    public function filters(ProductFilters $filters): array
    {
        return $this->products->facets($filters);
    }

    /** @return array{product: array<string, mixed>, offers: list<array<string, mixed>>} */
    public function show(string $slug): array
    {
        $product = $this->products->findBySlug($slug) ?? throw ApiException::notFound('Product not found');
        $offers = $this->products->offersFor($product['id']);

        // Card figures come from the same offers we return, so the page can never disagree with itself.
        $cheapest = $offers[0] ?? null;
        $card = $this->card($product + [
            'from_price_cents' => $cheapest['price_cents'] ?? null,
            'offer_count' => count($offers),
            'discount_pct' => $cheapest['discount_pct'] ?? null,
            'in_stock' => $offers !== [],
        ]);

        return [
            'product' => $card + [
                'description' => $product['description'],
                'releaseDate' => $product['release_date'],
                'genres' => [$product['genre']],
                'publisher' => $product['publisher'],
            ],
            'offers' => array_map(static function (array $o): array {
                $offer = [
                    'id' => $o['id'],
                    'seller' => ['id' => $o['seller_id'], 'name' => $o['seller_name'], 'rating' => $o['seller_rating']],
                    'priceCents' => $o['price_cents'],
                ];
                if ($o['original_price_cents'] !== null) {
                    $offer['originalPriceCents'] = $o['original_price_cents'];
                }

                return $offer + ['stock' => $o['stock'], 'deliveryType' => 'instant'];
            }, $offers),
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function card(array $row): array
    {
        $card = [
            'id' => $row['id'],
            'slug' => $row['slug'],
            'name' => $row['name'],
            'coverUrl' => '/api/images/products/' . $row['slug'] . '.svg',
            'platform' => ['slug' => $row['platform_slug'], 'name' => $row['platform_name']],
            'region' => ['slug' => $row['region_slug'], 'name' => $row['region_name']],
            'offerId' => $row['offer_id'],
            'fromPriceCents' => $row['from_price_cents'],
            'offerCount' => $row['offer_count'],
            'inStock' => $row['in_stock'],
        ];
        if ($row['discount_pct'] !== null) {
            $card['discountPct'] = $row['discount_pct'];
        }

        return $card;
    }
}
