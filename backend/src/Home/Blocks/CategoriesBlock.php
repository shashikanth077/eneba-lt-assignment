<?php

declare(strict_types=1);

namespace App\Home\Blocks;

use App\Cache\TtlCache;
use App\Home\HomeBlock;
use PDO;

/**
 * The shortcut strip under the banner (Games, Steam, PlayStation, ...). Source: the platforms and genres that really have products,
 * so every shortcut leads to a non-empty store page. `icon` is a plain key the frontend maps to a picture. Cached for 10 minutes.
 *
 * Standalone on purpose (own SQL, own payload): see BestSellersBlock.
 */
final class CategoriesBlock implements HomeBlock
{
    public const SLUG = 'categories';
    public const PATH = '/api/home/categories';
    public const TTL_SECONDS = 600;
    private const DEFAULT_GENRES = 4;

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
        $genres = max(0, min(10, (int) ($config['genres'] ?? self::DEFAULT_GENRES)));

        return $this->cache->remember("v1:genres=$genres", self::TTL_SECONDS, fn (): array => ['items' => $this->items($genres)]);
    }

    /** @return list<array{id: string, label: string, to: string, icon: string}> */
    private function items(int $genres): array
    {
        $items = [['id' => 'games', 'label' => 'Games', 'to' => '/store', 'icon' => 'games']];

        $platforms = $this->pdo->query(
            'SELECT pl.slug, pl.name FROM platforms pl JOIN products p ON p.platform_id = pl.id GROUP BY pl.id, pl.slug, pl.name ORDER BY COUNT(*) DESC, pl.name',
        )->fetchAll();
        foreach ($platforms as $platform) {
            $items[] = [
                'id' => 'platform-' . $platform['slug'],
                'label' => $platform['name'],
                'to' => '/store?platform=' . rawurlencode($platform['slug']),
                'icon' => $platform['slug'],
            ];
        }

        $stmt = $this->pdo->prepare('SELECT genre FROM products GROUP BY genre ORDER BY COUNT(*) DESC, genre LIMIT ?');
        $stmt->bindValue(1, $genres, PDO::PARAM_INT);
        $stmt->execute();
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $genre) {
            $items[] = [
                'id' => 'genre-' . strtolower((string) $genre),
                'label' => (string) $genre,
                'to' => '/store?genre=' . rawurlencode((string) $genre),
                'icon' => 'genre',
            ];
        }

        return $items;
    }
}
