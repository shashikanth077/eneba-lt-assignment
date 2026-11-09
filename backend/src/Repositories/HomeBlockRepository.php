<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;

/** Reads the layout table home_blocks. The blocks themselves never touch it. */
final class HomeBlockRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array{slug: string, type: string, title: string, endpoint: string, config: array<string, mixed>}> enabled rows, in display order */
    public function enabled(): array
    {
        $rows = $this->pdo
            ->query('SELECT slug, type, title, endpoint, config FROM home_blocks WHERE enabled = 1 ORDER BY position ASC, id ASC')
            ->fetchAll();

        return array_map(static function (array $row): array {
            $config = $row['config'] === null ? [] : json_decode((string) $row['config'], true);

            return [
                'slug' => (string) $row['slug'],
                'type' => (string) $row['type'],
                'title' => (string) $row['title'],
                'endpoint' => (string) $row['endpoint'],
                'config' => is_array($config) ? $config : [],
            ];
        }, $rows);
    }
}
