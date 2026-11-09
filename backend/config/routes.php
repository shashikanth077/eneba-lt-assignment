<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Controllers\CatalogController;
use App\Controllers\HealthController;
use App\Controllers\ImageController;
use App\Middleware\AuthMiddleware;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

return static function (App $app): void {
    $app->group('/api', function (RouteCollectorProxy $api): void {
        $api->get('/health', [HealthController::class, 'show']);

        $api->get('/products', [CatalogController::class, 'index']);
        $api->get('/products/{slug}', [CatalogController::class, 'show']);
        $api->get('/filters', [CatalogController::class, 'filters']);

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
