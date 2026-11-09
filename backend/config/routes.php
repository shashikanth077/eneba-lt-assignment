<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Controllers\CatalogController;
use App\Controllers\HealthController;
use App\Controllers\HomeController;
use App\Controllers\ImageController;
use App\Home\HomeBlockRegistry;
use App\Middleware\AuthMiddleware;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

return static function (App $app): void {
    $blocks = $app->getContainer()->get(HomeBlockRegistry::class)->routes(); // class constants only: no DB access here

    $app->group('/api', function (RouteCollectorProxy $api) use ($blocks): void {
        $api->get('/health', [HealthController::class, 'show']);

        $api->get('/products', [CatalogController::class, 'index']);
        $api->get('/products/{slug}', [CatalogController::class, 'show']);
        $api->get('/filters', [CatalogController::class, 'filters']);
        $api->get('/search', [CatalogController::class, 'search']);
        $api->get('/search/suggest', [CatalogController::class, 'suggest']);

        $api->get('/home/layout', [HomeController::class, 'layout']);
        foreach ($blocks as ['slug' => $slug, 'path' => $path]) {
            // one endpoint per block; the path is declared by the block itself
            $api->get(substr($path, strlen('/api')), [HomeController::class, 'block'])->setArgument('block', $slug);
        }

        $api->get('/images/products/{slug}.svg', [ImageController::class, 'productCover']);
        $api->get('/images/banners/{slug}.svg', [ImageController::class, 'banner']);

        $api->group('/auth', function (RouteCollectorProxy $auth): void {
            $auth->post('/register', [AuthController::class, 'register']);
            $auth->post('/login', [AuthController::class, 'login']);
            $auth->post('/logout', [AuthController::class, 'logout']);
            $auth->get('/me', [AuthController::class, 'me'])->add(AuthMiddleware::class);
        });
    });
};
