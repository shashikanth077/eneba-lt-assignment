<?php

declare(strict_types=1);

use App\Controllers\AuthController;
use App\Controllers\CartController;
use App\Controllers\CheckoutController;
use App\Controllers\ClientLogController;
use App\Controllers\OrderController;
use App\Controllers\WebhookController;
use App\Controllers\CatalogController;
use App\Controllers\HealthController;
use App\Controllers\HomeController;
use App\Controllers\ImageController;
use App\Home\HomeBlockRegistry;
use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\RateLimiter;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

return static function (App $app): void {
    $blocks = $app->getContainer()->get(HomeBlockRegistry::class)->routes(); // class constants only: no DB access here
    $container = $app->getContainer();
    $limits = $container->get('settings')['rate_limits'];
    $proxies = $container->get('settings')['auth']['trusted_proxies'];
    $limit = static fn (string $bucket, int $max, int $window, bool $perUser = false): RateLimitMiddleware => new RateLimitMiddleware(
        static fn (): RateLimiter => $container->get(RateLimiter::class), // lazy: no database connection just for listing routes
        $bucket,
        $max,
        $window,
        $proxies,
        $perUser,
    );

    $app->group('/api', function (RouteCollectorProxy $api) use ($blocks, $limit, $limits): void {
        $api->get('/health', [HealthController::class, 'show']);
        // The browser reports e-mail/payment/UI problems here so they show up in the server log (docs/LOGGING.md); limited per address
        $api->post('/client-log', [ClientLogController::class, 'report'])->add($limit('client_log', $limits['client_log_per_minute'], 60));

        $api->get('/products', [CatalogController::class, 'index']);
        $api->get('/products/{slug}', [CatalogController::class, 'show']);
        $api->get('/filters', [CatalogController::class, 'filters']);
        // The two endpoints that scan the whole catalogue for every call (docs/SEARCH.md), open to anyone: limited per address.
        $api->get('/search', [CatalogController::class, 'search'])->add($limit('search', $limits['search_per_minute_per_ip'], 60));
        $api->get('/search/suggest', [CatalogController::class, 'suggest'])->add($limit('search', $limits['search_per_minute_per_ip'], 60));

        $api->get('/home/layout', [HomeController::class, 'layout']);
        foreach ($blocks as ['slug' => $slug, 'path' => $path]) {
            // one endpoint per block; the path is declared by the block itself
            $api->get(substr($path, strlen('/api')), [HomeController::class, 'block'])->setArgument('block', $slug);
        }

        // Everything a signed-in buyer does with money: cart, checkout, orders
        $api->group('', function (RouteCollectorProxy $shop) use ($limit, $limits): void {
            $shop->get('/cart', [CartController::class, 'show']);
            $shop->post('/cart', [CartController::class, 'add']);
            $shop->patch('/cart/{offerId}', [CartController::class, 'update']);
            $shop->delete('/cart/{offerId}', [CartController::class, 'remove']);
            $shop->delete('/cart', [CartController::class, 'clear']);
            // Checkout locks stock for 15 minutes: limited per ACCOUNT so one buyer cannot keep re-reserving keys.
            $shop->post('/checkout', [CheckoutController::class, 'create'])->add($limit('checkout', $limits['checkout_per_10min_per_user'], 600, true));
            $shop->get('/orders', [OrderController::class, 'index']);
            $shop->get('/orders/{id}', [OrderController::class, 'show']);
        })->add(AuthMiddleware::class);

        // Called by Stripe, authenticated by signature (no cookie, no CSRF header)
        $api->post('/webhooks/stripe', [WebhookController::class, 'stripe']);

        $api->get('/images/products/{slug}.svg', [ImageController::class, 'productCover']);
        $api->get('/images/banners/{slug}.svg', [ImageController::class, 'banner']);

        $api->group('/auth', function (RouteCollectorProxy $auth) use ($limit, $limits): void {
            // Every sign-up costs an Argon2id hash (CPU and 64 MB) and creates an account that can hold stock: limited per address.
            $auth->post('/register', [AuthController::class, 'register'])->add($limit('register', $limits['register_per_hour_per_ip'], 3600));
            $auth->post('/login', [AuthController::class, 'login']);
            $auth->post('/logout', [AuthController::class, 'logout']);
            $auth->post('/verify-email', [AuthController::class, 'verifyEmail']);
            $auth->post('/resend-verification', [AuthController::class, 'resendVerification'])
                ->add($limit('resend_verification', $limits['resend_verification_per_hour'], 3600, true))
                ->add(AuthMiddleware::class);
            $auth->patch('/profile', [AuthController::class, 'updateProfile'])->add(AuthMiddleware::class);
            $auth->post('/change-password', [AuthController::class, 'changePassword'])
                ->add($limit('change_password', $limits['change_password_per_hour'], 3600, true))
                ->add(AuthMiddleware::class);
            $auth->get('/me', [AuthController::class, 'me'])->add(AuthMiddleware::class);
        });
    });
};
