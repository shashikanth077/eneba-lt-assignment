<?php

declare(strict_types=1);

namespace App\Home\Blocks;

use App\Cache\TtlCache;
use App\Home\HomeBlock;
use PDO;

/** Hero banners. Source: the `banners` table. Cached for 5 minutes. */
final class BannersBlock implements HomeBlock
{
    public const SLUG = 'banner';
    public const PATH = '/api/home/banners';
    public const TTL_SECONDS = 300;

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
        return $this->cache->remember('v1', self::TTL_SECONDS, fn (): array => ['items' => $this->query()]);
    }

    /** @return list<array<string, mixed>> */
    private function query(): array
    {
        $rows = $this->pdo
            ->query('SELECT id, slug, title, subtitle, cta_label, href FROM banners WHERE active = 1 ORDER BY position ASC, id ASC')
            ->fetchAll();

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'imageUrl' => '/api/images/banners/' . $row['slug'] . '.svg',
            'title' => $row['title'],
            'subtitle' => $row['subtitle'],
            'ctaLabel' => $row['cta_label'],
            'href' => $row['href'],
        ], $rows);
    }
}
