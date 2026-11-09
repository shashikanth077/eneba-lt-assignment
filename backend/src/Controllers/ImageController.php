<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Exceptions\ApiException;
use App\Repositories\ImageRepository;
use Psr\Http\Message\ResponseInterface;

/** Serves the generated SVG artwork stored in the database. */
final class ImageController
{
    public function __construct(private readonly ImageRepository $images)
    {
    }

    public function productCover(ResponseInterface $response, string $slug): ResponseInterface
    {
        return $this->svg($response, $this->images->productCover($slug));
    }

    public function banner(ResponseInterface $response, string $slug): ResponseInterface
    {
        return $this->svg($response, $this->images->banner($slug));
    }

    private function svg(ResponseInterface $response, ?string $svg): ResponseInterface
    {
        if ($svg === null) {
            throw ApiException::notFound('Image not found');
        }
        $response->getBody()->write($svg);

        return $response
            ->withHeader('Content-Type', 'image/svg+xml; charset=utf-8')
            ->withHeader('Cache-Control', 'public, max-age=86400')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    }
}
