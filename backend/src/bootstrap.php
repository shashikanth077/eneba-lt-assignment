<?php

declare(strict_types=1);

use App\Http\JsonErrorHandler;
use App\Middleware\CorsMiddleware;
use App\Middleware\CsrfMiddleware;
use App\Middleware\RequestLogMiddleware;
use App\Middleware\SecurityHeadersMiddleware;
use App\Support\ConfigGuard;
use App\Support\Log;
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
    Log::configure($settings['log']['level']);
    try {
        ConfigGuard::assertSafe($settings); // a public deployment must not run on the secrets published in this repository
    } catch (\Throwable $e) {
        Log::error('app.config.unsafe', 'the application refuses to start: ' . $e->getMessage()); // the one place a misconfigured deploy says why
        throw $e;
    }
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
    $app->add(new SecurityHeadersMiddleware($settings['auth']['cookie_secure'])); // also covers CORS preflights and error responses
    $app->add(new RequestLogMiddleware($settings['auth']['trusted_proxies'])); // outermost: request id on every line, one line per request

    (require $root . '/config/routes.php')($app);

    return $app;
};
