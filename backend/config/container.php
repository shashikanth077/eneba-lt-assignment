<?php

declare(strict_types=1);

use App\Auth\SessionCookie;
use App\Cache\CacheFactory;
use App\Auth\TokenService;
use App\Controllers\AuthController;
use App\Home\Blocks\BannersBlock;
use App\Home\Blocks\BestSellersBlock;
use App\Home\Blocks\CategoriesBlock;
use App\Home\Blocks\RecommendedBlock;
use App\Home\Blocks\UpcomingBlock;
use App\Home\Blocks\DealsBlock;
use App\Home\Blocks\NewReleasesBlock;
use App\Home\HomeBlockRegistry;
use App\Mail\EmailJsVerificationMailer;
use App\Mail\NullVerificationMailer;
use App\Mail\VerificationMailer;
use App\Payment\PaymentGateway;
use App\Payment\StripePaymentGateway;
use App\Payment\StripeWebhookVerifier;
use App\Payment\UnconfiguredPaymentGateway;
use App\Repositories\CartRepository;
use App\Repositories\KeyRepository;
use App\Repositories\OrderRepository;
use App\Services\CartService;
use App\Services\CheckoutService;
use App\Services\OrderLifecycle;
use App\Repositories\LoginAttemptRepository;
use App\Services\AuthService;
use App\Services\EmailVerificationService;
use App\Services\LoginThrottle;
use App\Support\Database;
use App\Support\KeyCipher;
use App\Support\RateLimiter;
use DI\ContainerBuilder;
use Psr\Container\ContainerInterface;

/**
 * @param array<string, mixed> $settings
 * @param array<string, mixed> $overrides definitions that replace the defaults (tests inject a fake payment gateway here)
 */
return static function (array $settings, array $overrides = []): ContainerInterface {
    $auth = $settings['auth'];
    $stripe = $settings['stripe'];
    $checkout = $settings['checkout'];
    // Each homepage block gets its OWN cache namespace, so blocks can be tuned, purged or extracted independently.
    $blockCache = static fn (ContainerInterface $c, string $slug) => $c->get(CacheFactory::class)->for($slug);

    $builder = new ContainerBuilder();
    $builder->addDefinitions([
        'settings' => $settings,
        // Lazy: the connection opens only when something needs PDO.
        PDO::class => static fn (ContainerInterface $c): PDO => Database::connect($c->get('settings')['db']),
        KeyCipher::class => static fn (): KeyCipher => KeyCipher::fromBase64($settings['keys']['encryption']),
        TokenService::class => static fn (): TokenService => new TokenService($auth['jwt_secret'], $auth['ttl_seconds']),
        SessionCookie::class => static fn (): SessionCookie => new SessionCookie($auth['ttl_seconds'], $auth['cookie_secure']),
        LoginThrottle::class => static fn (ContainerInterface $c): LoginThrottle => new LoginThrottle(
            $c->get(LoginAttemptRepository::class),
            $auth['login_max_per_email'],
            $auth['login_max_per_ip'],
            $auth['login_window_seconds'],
        ),
        RateLimiter::class => static fn (ContainerInterface $c): RateLimiter => new RateLimiter($c->get(PDO::class), $settings['rate_limits']['enabled']),
        KeyRepository::class => static fn (ContainerInterface $c): KeyRepository => new KeyRepository($c->get(PDO::class), $settings['db']['lock_strategy']),
        CacheFactory::class => static fn (): CacheFactory => new CacheFactory($settings['cache']['driver'], $settings['cache']['dir']),
        HomeBlockRegistry::class => static fn (ContainerInterface $c): HomeBlockRegistry => new HomeBlockRegistry($c, require __DIR__ . '/home.php'),
        BannersBlock::class => static fn (ContainerInterface $c): BannersBlock => new BannersBlock($c->get(PDO::class), $blockCache($c, BannersBlock::SLUG)),
        CategoriesBlock::class => static fn (ContainerInterface $c): CategoriesBlock => new CategoriesBlock($c->get(PDO::class), $blockCache($c, CategoriesBlock::SLUG)),
        RecommendedBlock::class => static fn (ContainerInterface $c): RecommendedBlock => new RecommendedBlock($c->get(PDO::class), $blockCache($c, RecommendedBlock::SLUG)),
        UpcomingBlock::class => static fn (ContainerInterface $c): UpcomingBlock => new UpcomingBlock($c->get(PDO::class), $blockCache($c, UpcomingBlock::SLUG)),
        BestSellersBlock::class => static fn (ContainerInterface $c): BestSellersBlock => new BestSellersBlock($c->get(PDO::class), $blockCache($c, BestSellersBlock::SLUG)),
        DealsBlock::class => static fn (ContainerInterface $c): DealsBlock => new DealsBlock($c->get(PDO::class), $blockCache($c, DealsBlock::SLUG)),
        NewReleasesBlock::class => static fn (ContainerInterface $c): NewReleasesBlock => new NewReleasesBlock($c->get(PDO::class), $blockCache($c, NewReleasesBlock::SLUG)),
        PaymentGateway::class => static fn (): PaymentGateway => $stripe['secret_key'] !== ''
            ? new StripePaymentGateway($stripe['secret_key'])
            : new UnconfiguredPaymentGateway(),
        StripeWebhookVerifier::class => static fn (): StripeWebhookVerifier => new StripeWebhookVerifier($stripe['webhook_secret'], $stripe['webhook_tolerance']),
        CartService::class => static fn (ContainerInterface $c): CartService => new CartService($c->get(CartRepository::class), $checkout['currency']),
        CheckoutService::class => static fn (ContainerInterface $c): CheckoutService => new CheckoutService(
            $c->get(PDO::class),
            $c->get(CartRepository::class),
            $c->get(OrderRepository::class),
            $c->get(KeyRepository::class),
            $c->get(OrderLifecycle::class),
            $c->get(PaymentGateway::class),
            $checkout['currency'],
            $checkout['reservation_minutes'],
        ),
        VerificationMailer::class => static function () use ($settings): VerificationMailer {
            $mail = $settings['mail'];
            $ready = $mail['service_id'] !== '' && $mail['auth_template_id'] !== '' && $mail['public_key'] !== '' && $mail['private_key'] !== '';

            return $ready ? new EmailJsVerificationMailer($mail) : new NullVerificationMailer();
        },
        EmailVerificationService::class => static fn (ContainerInterface $c): EmailVerificationService => new EmailVerificationService(
            $c->get(PDO::class),
            $c->get(VerificationMailer::class),
            $settings,
        ),
        AuthController::class => static fn (ContainerInterface $c): AuthController => new AuthController(
            $c->get(AuthService::class),
            $c->get(TokenService::class),
            $c->get(SessionCookie::class),
            $c->get(EmailVerificationService::class),
            $auth['trusted_proxies'],
        ),
    ]);
    $builder->addDefinitions($overrides);

    return $builder->build();
};
