<?php

declare(strict_types=1);

namespace App\Home\Blocks;

use App\Cache\TtlCache;
use App\Home\HomeBlock;
use PDO;

/**
 * Recommended for you. Source: `product_stats.popularity` against the cheapest buyable price, so what is popular AND good value comes
 * first. It is the same list for every visitor (the shop knows nothing personal about a visitor here); personal history is the separate
 * "recently viewed" row. Cached for 10 minutes.
 *
 * Standalone on purpose (own SQL, own card mapping): see BestSellersBlock.
 */
final class RecommendedBlock implements HomeBlock
{
    public const SLUG = 'recommended';
    public const PATH = '/api/home/recommended';
    public const TTL_SECONDS = 600;
    private const DEFAULT_LIMIT = 10;
    private const MAX_LIMIT = 50;

    public function __construct(private readonly PDO $pdo, private readonly TtlCache $cache)
    {
    }

    public function slug(): string
    {
        return self::SLUG;
    }

    public function path(): string
    {
        return self::PATH;
    }

    public function fetch(array $config): array
    {
        $limit = max(1, min(self::MAX_LIMIT, (int) ($config['limit'] ?? self::DEFAULT_LIMIT)));

        // CURDATE() changes at midnight, so the date is part of the key: yesterday's list is never served as today's
        $today = date('Y-m-d');

        return $this->cache->remember("v1:limit=$limit:day=$today", self::TTL_SECONDS, fn (): array => ['items' => $this->query($limit)]);
    }

    /** @return list<array<string, mixed>> */
    private function query(int $limit): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.id, p.slug, p.name, pl.slug AS platform_slug, pl.name AS platform_name,
                    r.slug AS region_slug, r.name AS region_name,
                    a.offer_id, a.price_cents, a.offer_count, a.discount_pct
             FROM products p
             JOIN platforms pl ON pl.id = p.platform_id
             JOIN regions r ON r.id = p.region_id
             JOIN (
                 SELECT o.id AS offer_id, o.product_id, o.price_cents, d.discount_pct,
                        ROW_NUMBER() OVER (PARTITION BY o.product_id ORDER BY o.price_cents, o.id) AS rn,
                        COUNT(*) OVER (PARTITION BY o.product_id) AS offer_count
                 FROM offers o
                 LEFT JOIN deals d ON d.offer_id = o.id AND (d.ends_at IS NULL OR d.ends_at > NOW())
                 WHERE o.active = 1
                   AND (SELECT k.id FROM game_keys k WHERE k.offer_id = o.id AND k.status = \'available\' LIMIT 1) IS NOT NULL
             ) a ON a.product_id = p.id AND a.rn = 1
             JOIN product_stats st ON st.product_id = p.id
             ORDER BY st.popularity / a.price_cents DESC, p.id ASC
             LIMIT ?',
        );
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();

        return array_map(self::card(...), $stmt->fetchAll());
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function card(array $row): array
    {
        $card = [
            'id' => (int) $row['id'],
            'slug' => $row['slug'],
            'name' => $row['name'],
            'coverUrl' => '/api/images/products/' . $row['slug'] . '.svg',
            'platform' => ['slug' => $row['platform_slug'], 'name' => $row['platform_name']],
            'region' => ['slug' => $row['region_slug'], 'name' => $row['region_name']],
            'offerId' => (int) $row['offer_id'],
            'fromPriceCents' => (int) $row['price_cents'],
            'offerCount' => (int) $row['offer_count'],
            'inStock' => true,
        ];
        if ($row['discount_pct'] !== null) {
            $card['discountPct'] = (int) $row['discount_pct'];
        }

        return $card;
    }
}
