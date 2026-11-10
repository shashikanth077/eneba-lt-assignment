<?php

declare(strict_types=1);

namespace Tests;

use App\Support\ConfigGuard;
use App\Support\Doctor;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/** REVIEW.md S2: the published example secrets must never run a public deployment. */
final class ConfigGuardTest extends TestCase
{
    private const GOOD_JWT = 'a-long-random-secret-that-is-not-published-anywhere-0123';
    private const GOOD_KEY = 'cmFuZG9tLXRoaXJ0eS10d28tYnl0ZXMtbm90LXB1Ymxpc2hlZA==';

    /** @param array<string, mixed> $over */
    private function settings(array $over = []): array
    {
        return array_replace_recursive([
            'env' => 'production',
            'debug' => false,
            'app_url' => 'https://shop.example.com',
            'auth' => ['jwt_secret' => self::GOOD_JWT, 'cookie_secure' => true],
            'keys' => ['encryption' => self::GOOD_KEY],
        ], $over);
    }

    public function testAProperlyConfiguredPublicDeploymentPasses(): void
    {
        self::assertSame([], ConfigGuard::problems($this->settings()));
        ConfigGuard::assertSafe($this->settings()); // does not throw
    }

    public function testMissingSecretsAreReportedAtStartInsteadOfFailingRequestByRequest(): void
    {
        $problems = ConfigGuard::problems($this->settings(['auth' => ['jwt_secret' => ''], 'keys' => ['encryption' => '']]));

        self::assertCount(2, $problems);
        self::assertStringContainsString('JWT_SECRET is not set', $problems[0]);
        self::assertStringContainsString('KEY_ENCRYPTION_KEY is not set', $problems[1]);
    }

    public function testADeploymentWithoutADatabaseHostIsRefusedInsteadOfTryingLocalhost(): void
    {
        $problems = ConfigGuard::problems($this->settings(['db' => ['host' => '']]));

        self::assertCount(1, $problems);
        self::assertStringContainsString('DB_HOST (or MYSQL_HOST)', $problems[0]);
    }

    public function testThePublishedJwtSecretIsRefusedBecauseItLetsAnyoneForgeASession(): void
    {
        $settings = $this->settings(['auth' => ['jwt_secret' => ConfigGuard::KNOWN_JWT_SECRETS[0]]]);

        self::assertCount(1, ConfigGuard::problems($settings));
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('JWT_SECRET');
        ConfigGuard::assertSafe($settings);
    }

    public function testThePublishedKeyEncryptionKeyIsRefusedBecauseItDecryptsEveryGameKey(): void
    {
        $problems = ConfigGuard::problems($this->settings(['keys' => ['encryption' => ConfigGuard::KNOWN_KEY_ENCRYPTION_KEYS[0]]]));
        self::assertCount(1, $problems);
        self::assertStringContainsString('KEY_ENCRYPTION_KEY', $problems[0]);
    }

    public function testDebugAndInsecureCookiesAreRefusedToo(): void
    {
        $problems = ConfigGuard::problems($this->settings(['debug' => true, 'auth' => ['cookie_secure' => false]]));
        self::assertCount(2, $problems);
    }

    public function testCopyingEnvExampleDoesNotEscapeTheGuardJustByKeepingAppEnvLocal(): void
    {
        // .env.example says APP_ENV=local; the deployer only added the real frontend address (needed for CSRF)
        $copied = $this->settings(['env' => 'local', 'debug' => true, 'auth' => ['jwt_secret' => ConfigGuard::KNOWN_JWT_SECRETS[0], 'cookie_secure' => false], 'keys' => ['encryption' => ConfigGuard::KNOWN_KEY_ENCRYPTION_KEYS[0]]]);

        self::assertCount(4, ConfigGuard::problems($copied));
    }

    /** @return array<string, array{string, string}> */
    public static function localUrls(): array
    {
        return ['no url' => ['local', ''], 'localhost' => ['local', 'http://localhost:5173'], 'loopback' => ['test', 'http://127.0.0.1:5173'], 'ipv6' => ['local', 'http://[::1]:5173']];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('localUrls')]
    public function testOnALocalMachineThePlaceholdersAreAllowed(string $env, string $url): void
    {
        $settings = $this->settings(['env' => $env, 'app_url' => $url, 'debug' => true, 'auth' => ['jwt_secret' => ConfigGuard::KNOWN_JWT_SECRETS[0], 'cookie_secure' => false], 'keys' => ['encryption' => ConfigGuard::KNOWN_KEY_ENCRYPTION_KEYS[0]]]);
        self::assertTrue(ConfigGuard::isLocal($settings));
        self::assertSame([], ConfigGuard::problems($settings));
    }

    public function testProductionIsNeverLocalEvenOnLocalhost(): void
    {
        self::assertFalse(ConfigGuard::isLocal($this->settings(['app_url' => 'http://localhost:5173'])));
    }

    public function testTheDoctorTellsALocalDeveloperAndFailsAPublicDeployment(): void
    {
        $placeholders = ['auth' => ['jwt_secret' => ConfigGuard::KNOWN_JWT_SECRETS[0]], 'keys' => ['encryption' => ConfigGuard::KNOWN_KEY_ENCRYPTION_KEYS[0]]];

        self::assertSame('warn', Doctor::placeholders($this->settings($placeholders + ['env' => 'local', 'app_url' => 'http://localhost:5173']))['status']);
        self::assertSame('fail', Doctor::placeholders($this->settings($placeholders))['status']);
        self::assertSame('pass', Doctor::placeholders($this->settings())['status']);
    }

    public function testTheRealAppRefusesToBootWithThePublishedSecretsWhenItIsNotLocal(): void
    {
        $keep = array_intersect_key($_ENV, array_flip(['APP_ENV', 'APP_URL', 'JWT_SECRET', 'COOKIE_SECURE', 'APP_DEBUG']));
        $_ENV['APP_ENV'] = 'production';
        $_ENV['APP_URL'] = 'https://shop.example.com';
        $_ENV['JWT_SECRET'] = ConfigGuard::KNOWN_JWT_SECRETS[0];
        $_ENV['COOKIE_SECURE'] = 'true';
        $_ENV['APP_DEBUG'] = 'false';
        try {
            $this->expectException(RuntimeException::class);
            $this->expectExceptionMessage('JWT_SECRET');
            (require __DIR__ . '/../src/bootstrap.php')();
        } finally {
            foreach (['APP_ENV', 'APP_URL', 'JWT_SECRET', 'COOKIE_SECURE', 'APP_DEBUG'] as $name) {
                isset($keep[$name]) ? $_ENV[$name] = $keep[$name] : $_ENV[$name] = null;
                if (!isset($keep[$name])) {
                    unset($_ENV[$name]);
                }
            }
        }
    }
}
