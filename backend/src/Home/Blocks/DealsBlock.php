<?php

declare(strict_types=1);

namespace App\Home\Blocks;

use App\Cache\TtlCache;
use App\Home\HomeBlock;
use PDO;

/**
 * Hot deals. Source: the `deals` table. Only products whose cheapest buyable offer is on deal are shown (so the price on the
 * card is the discounted one), biggest discount first. Cached for 2 minutes: deals expire, so this block has the shortest TTL.
 *
 * Standalone on purpose (own SQL, own card mapping): see BestSellersBlock.
 */
final class DealsBlock implements HomeBlock
{
    public const SLUG = 'deals';
    public const PATH = '/api/home/deals';
    public const TTL_SECONDS = 120;
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

        return $this->cache->remember("v1:limit=$limit", self::TTL_SECONDS, fn (): array => ['items' => $this->query($limit)]);
    }

    /** @return list<array<string, mixed>> */
    private function query(int $limit): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.id, p.slug, p.name, pl.slug AS platform_slug, pl.name AS platform_name,
                    r.slug AS region_slug, r.name AS region_name,
                    a.offer_id, a.price_cents, a.offer_count, a.discount_pct, a.original_price_cents
             FROM products p
             JOIN platforms pl ON pl.id = p.platform_id
             JOIN regions r ON r.id = p.region_id
             JOIN (
                 SELECT o.id AS offer_id, o.product_id, o.price_cents, d.discount_pct, d.original_price_cents,
                        ROW_NUMBER() OVER (PARTITION BY o.product_id ORDER BY o.price_cents, o.id) AS rn,
                        COUNT(*) OVER (PARTITION BY o.product_id) AS offer_count
                 FROM offers o
                 LEFT JOIN deals d ON d.offer_id = o.id AND (d.ends_at IS NULL OR d.ends_at > NOW())
                 WHERE o.active = 1
                   AND (SELECT k.id FROM game_keys k WHERE k.offer_id = o.id AND k.status = \'available\' LIMIT 1) IS NOT NULL
             ) a ON a.product_id = p.id AND a.rn = 1
             LEFT JOIN product_stats s ON s.product_id = p.id
             WHERE a.discount_pct IS NOT NULL
             ORDER BY a.discount_pct DESC, COALESCE(s.popularity, 0) DESC, p.id ASC
             LIMIT ?',
        );
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();

        return array_map(self::card(...), $stmt->fetchAll());
    }

    /**
     * Deals show the crossed-out price, so unlike the other blocks the items also carry originalPriceCents.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function card(array $row): array
    {
        return [
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
            'discountPct' => (int) $row['discount_pct'],
            'originalPriceCents' => (int) $row['original_price_cents'],
        ];
    }
}
