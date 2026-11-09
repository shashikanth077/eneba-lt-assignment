<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;

final class ImageRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function productCover(string $slug): ?string
    {
        return $this->column('SELECT cover_svg FROM products WHERE slug = ?', $slug);
    }

    public function banner(string $slug): ?string
    {
        return $this->column('SELECT image_svg FROM banners WHERE slug = ? AND active = 1', $slug);
    }

    private function column(string $sql, string $slug): ?string
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$slug]);
        $value = $stmt->fetchColumn();

        return $value === false ? null : (string) $value;
    }
}
