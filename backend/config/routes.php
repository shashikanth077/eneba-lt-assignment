<?php

declare(strict_types=1);

use App\Controllers\HealthController;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

return static function (App $app): void {
    $app->group('/api', function (RouteCollectorProxy $api): void {
        $api->get('/health', [HealthController::class, 'show']);
    });
};
