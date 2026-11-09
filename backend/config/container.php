<?php

declare(strict_types=1);

use App\Auth\SessionCookie;
use App\Cache\CacheFactory;
use App\Auth\TokenService;
use App\Controllers\AuthController;
use App\Home\Blocks\BannersBlock;
use App\Home\Blocks\BestSellersBlock;
use App\Home\Blocks\DealsBlock;
use App\Home\Blocks\NewReleasesBlock;
use App\Home\HomeBlockRegistry;
use App\Repositories\LoginAttemptRepository;
use App\Services\AuthService;
use App\Services\LoginThrottle;
use App\Support\Database;
use App\Support\KeyCipher;
use DI\ContainerBuilder;
use Psr\Container\ContainerInterface;

/** @param array<string, mixed> $settings */
return static function (array $settings): ContainerInterface {
    $auth = $settings['auth'];
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
        CacheFactory::class => static fn (): CacheFactory => new CacheFactory($settings['cache']['driver'], $settings['cache']['dir']),
        HomeBlockRegistry::class => static fn (ContainerInterface $c): HomeBlockRegistry => new HomeBlockRegistry($c, require __DIR__ . '/home.php'),
        BannersBlock::class => static fn (ContainerInterface $c): BannersBlock => new BannersBlock($c->get(PDO::class), $blockCache($c, BannersBlock::SLUG)),
        BestSellersBlock::class => static fn (ContainerInterface $c): BestSellersBlock => new BestSellersBlock($c->get(PDO::class), $blockCache($c, BestSellersBlock::SLUG)),
        DealsBlock::class => static fn (ContainerInterface $c): DealsBlock => new DealsBlock($c->get(PDO::class), $blockCache($c, DealsBlock::SLUG)),
        NewReleasesBlock::class => static fn (ContainerInterface $c): NewReleasesBlock => new NewReleasesBlock($c->get(PDO::class), $blockCache($c, NewReleasesBlock::SLUG)),
        AuthController::class => static fn (ContainerInterface $c): AuthController => new AuthController(
            $c->get(AuthService::class),
            $c->get(TokenService::class),
            $c->get(SessionCookie::class),
            $auth['trust_proxy'],
        ),
    ]);

    return $builder->build();
};
