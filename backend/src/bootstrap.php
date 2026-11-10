<?php

declare(strict_types=1);

use App\Http\JsonErrorHandler;
use App\Middleware\CorsMiddleware;
use App\Middleware\CsrfMiddleware;
use App\Middleware\SecurityHeadersMiddleware;
use App\Support\ConfigGuard;
use DI\Bridge\Slim\Bridge;
use Dotenv\Dotenv;
use Slim\App;

/**
 * Builds the Slim app. Used by public/index.php and by tests.
 *
 * @param array<string, mixed> $overrides container definitions to replace (tests only)
 */
return static function (array $overrides = []): App {
    $root = dirname(__DIR__);
    Dotenv::createImmutable($root)->safeLoad(); // real env vars (Docker) win over .env

    $settings = (require $root . '/config/settings.php')();
    ConfigGuard::assertSafe($settings); // a public deployment must not run on the secrets published in this repository
    $container = (require $root . '/config/container.php')($settings, $overrides);

    $app = Bridge::create($container);
    if ($settings['base_path'] !== '') {
        $app->setBasePath($settings['base_path']); // XAMPP: http://localhost/keymart/backend/public/api/...
    }
    $responses = $app->getResponseFactory();

    // Middleware runs last-added-first: CORS wraps everything, so error responses get CORS headers too.
    $app->addRoutingMiddleware();
    $app->addBodyParsingMiddleware();
    $allowedOrigins = array_values(array_filter([...$settings['cors']['origins'], $settings['app_url']]));
    // The Stripe webhook is not sent by a browser: it is authenticated by its signature instead of the CSRF header.
    $app->add(new CsrfMiddleware($allowedOrigins, [$settings['base_path'] . '/api/webhooks/stripe']));
    $errors = $app->addErrorMiddleware($settings['debug'], false, false);
    $errors->setDefaultErrorHandler(
        static fn ($request, Throwable $e) => (new JsonErrorHandler($responses, $settings['debug']))($request, $e)
    );
    $app->add(new CorsMiddleware($responses, $settings['cors']['origins']));
    $app->add(new SecurityHeadersMiddleware($settings['auth']['cookie_secure'])); // outermost: also covers CORS preflights and error responses

    (require $root . '/config/routes.php')($app);

    return $app;
};
