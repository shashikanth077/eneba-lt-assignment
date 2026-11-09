<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Exceptions\ApiException;
use App\Home\HomeBlockRegistry;
use App\Home\HomeLayout;
use App\Http\JsonResponse;
use Psr\Http\Message\ResponseInterface;

final class HomeController
{
    public function __construct(
        private readonly HomeLayout $layout,
        private readonly HomeBlockRegistry $registry,
    ) {
    }

    public function layout(ResponseInterface $response): ResponseInterface
    {
        // an empty config must encode as {} (an object), not []
        $blocks = array_map(static function (array $block): array {
            if ($block['config'] === []) {
                $block['config'] = new \stdClass();
            }

            return $block;
        }, $this->layout->blocks());

        return JsonResponse::write($response, ['blocks' => $blocks]);
    }

    /** One route per block (see config/routes.php); a disabled block answers 404 like it does not exist. */
    public function block(ResponseInterface $response, string $block): ResponseInterface
    {
        $config = $this->layout->configOf($block) ?? throw ApiException::notFound('This block is not available');

        return JsonResponse::write($response, $this->registry->get($block)->fetch($config));
    }
}
