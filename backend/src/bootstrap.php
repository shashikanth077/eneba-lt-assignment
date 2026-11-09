<?php

declare(strict_types=1);

use App\Http\JsonErrorHandler;
use App\Middleware\CorsMiddleware;
use DI\Bridge\Slim\Bridge;
use Dotenv\Dotenv;
use Slim\App;

/** Builds the Slim app. Used by public/index.php and by tests. */
return static function (): App {
    $root = dirname(__DIR__);
    Dotenv::createImmutable($root)->safeLoad(); // real env vars (Docker) win over .env

    $settings = (require $root . '/config/settings.php')();
    $container = (require $root . '/config/container.php')($settings);

    $app = Bridge::create($container);
    $responses = $app->getResponseFactory();

    // Middleware runs last-added-first: CORS wraps everything, so error responses get CORS headers too.
    $app->addRoutingMiddleware();
    $app->addBodyParsingMiddleware();
    $errors = $app->addErrorMiddleware($settings['debug'], false, false);
    $errors->setDefaultErrorHandler(
        static fn ($request, Throwable $e) => (new JsonErrorHandler($responses, $settings['debug']))($request, $e)
    );
    $app->add(new CorsMiddleware($responses, $settings['cors']['origins']));

    (require $root . '/config/routes.php')($app);

    return $app;
};
