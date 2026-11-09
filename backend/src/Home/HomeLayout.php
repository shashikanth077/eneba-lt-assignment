<?php

declare(strict_types=1);

namespace App\Home;

use App\Repositories\HomeBlockRepository;

/**
 * The homepage layout: which blocks are shown, in which order, rendered by which frontend component (`type`) and fetched
 * from which endpoint. Rows that are disabled, or that name a block without a backend implementation, are left out, so the
 * frontend never receives an endpoint that would answer 404. The layout is deliberately NOT cached: it is one tiny query,
 * and disabling a block should take effect immediately.
 */
final class HomeLayout
{
    public function __construct(
        private readonly HomeBlockRepository $rows,
        private readonly HomeBlockRegistry $registry,
    ) {
    }

    /** @return list<array{id: string, type: string, title: string, endpoint: string, config: array<string, mixed>}> */
    public function blocks(): array
    {
        $blocks = [];
        foreach ($this->rows->enabled() as $row) {
            if ($this->registry->has($row['slug'])) {
                $blocks[] = [
                    'id' => $row['slug'],
                    'type' => $row['type'],
                    'title' => $row['title'],
                    'endpoint' => $row['endpoint'],
                    'config' => $row['config'],
                ];
            }
        }

        return $blocks;
    }

    /** @return array<string, mixed>|null the block's config when it is currently shown, null when disabled or unknown */
    public function configOf(string $slug): ?array
    {
        foreach ($this->blocks() as $block) {
            if ($block['id'] === $slug) {
                return $block['config'];
            }
        }

        return null;
    }
}
