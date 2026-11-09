<?php

declare(strict_types=1);

namespace App\Catalog;

/** Allowed sort orders. The ORDER BY text comes from this enum, never from user input. */
enum ProductSort: string
{
    case Popular = 'popular';
    case PriceAsc = 'price_asc';
    case PriceDesc = 'price_desc';
    case Newest = 'newest';
    case Discount = 'discount';
    /** Only valid together with a text query; the order is the ranked id list (see ProductRepository). */
    case Relevance = 'relevance';

    /** Every order ends with p.id so pagination is stable (no duplicates/skips across pages). */
    public function orderBy(): string
    {
        return match ($this) {
            self::Popular => 'COALESCE(s.popularity, 0) DESC, p.id ASC',
            // out-of-stock products (no price) only appear in search results and always go last
            self::PriceAsc => '(a.price_cents IS NULL) ASC, a.price_cents ASC, p.id ASC',
            self::PriceDesc => '(a.price_cents IS NULL) ASC, a.price_cents DESC, p.id ASC',
            self::Newest => 'p.release_date DESC, p.id ASC',
            self::Discount => 'COALESCE(a.discount_pct, 0) DESC, COALESCE(s.popularity, 0) DESC, p.id ASC',
            self::Relevance => throw new \LogicException('Relevance ordering is built from the ranked ids, not from a constant'),
        };
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $s): string => $s->value, self::cases());
    }
}
