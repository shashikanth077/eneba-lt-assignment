<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

/**
 * Refuses to run a PUBLIC deployment with the placeholder secrets that ship in this repository (.env.example, docker-compose.yml).
 * Anyone can read those values on GitHub: with the example JWT secret they can sign a session cookie for any user id, and with the
 * example key-encryption key they can decrypt every game key in a copied database. Nothing in the app would look wrong, so the
 * only safe behaviour is to fail loudly before serving a request.
 *
 * "Public" is not decided by APP_ENV alone (copying .env.example brings APP_ENV=local along): a deployment counts as local only when
 * APP_ENV is local/test AND APP_URL is empty or points at the loopback interface. Setting a real APP_URL, which CSRF needs anyway,
 * switches the checks on.
 */
final class ConfigGuard
{
    /** Every secret that is published in this repository. */
    public const KNOWN_JWT_SECRETS = ['dev-only-secret-change-me-0123456789abcdef'];
    public const KNOWN_KEY_ENCRYPTION_KEYS = ['ZGV2LW9ubHkta2V5LWRvLW5vdC11c2UtaW4tcHJvZC0='];

    /** @param array<string, mixed> $settings */
    public static function isLocal(array $settings): bool
    {
        if (!in_array($settings['env'], ['local', 'test'], true)) {
            return false;
        }
        $host = parse_url((string) $settings['app_url'], PHP_URL_HOST);

        return $host === null || $host === false || in_array($host, ['localhost', '127.0.0.1', '::1', '[::1]'], true);
    }

    /**
     * What is wrong for a public deployment (empty list = fine, or local).
     *
     * @param array<string, mixed> $settings
     * @return list<string>
     */
    public static function problems(array $settings): array
    {
        if (self::isLocal($settings)) {
            return [];
        }
        $problems = [];
        if (($settings['db']['host'] ?? 'set') === '') {
            $problems[] = 'DB_HOST (or MYSQL_HOST) is not set. A deployment must name its database host; localhost is only a default for APP_ENV=local.';
        }
        if (strlen((string) $settings['auth']['jwt_secret']) < 32) {
            $problems[] = 'JWT_SECRET is not set (or shorter than 32 characters). Set it in the service environment: php -r "echo bin2hex(random_bytes(32));"';
        }
        if ((string) $settings['keys']['encryption'] === '') {
            $problems[] = 'KEY_ENCRYPTION_KEY is not set. Set it in the service environment: php -r "echo base64_encode(random_bytes(32));"';
        }
        if (in_array($settings['auth']['jwt_secret'], self::KNOWN_JWT_SECRETS, true)) {
            $problems[] = 'JWT_SECRET is the placeholder from .env.example: anyone can forge a session for any user. Generate one: php -r "echo bin2hex(random_bytes(32));"';
        }
        if (in_array($settings['keys']['encryption'], self::KNOWN_KEY_ENCRYPTION_KEYS, true)) {
            $problems[] = 'KEY_ENCRYPTION_KEY is the placeholder from .env.example: anyone can decrypt the game keys. Generate one: php -r "echo base64_encode(random_bytes(32));" (keys already stored with the old value must be re-encrypted)';
        }
        if (!$settings['auth']['cookie_secure']) {
            $problems[] = 'COOKIE_SECURE is false: the session cookie would travel over plain HTTP. Set COOKIE_SECURE=true.';
        }
        if ($settings['debug']) {
            $problems[] = 'APP_DEBUG is true: error responses would include stack traces. Set APP_DEBUG=false.';
        }

        return $problems;
    }

    /** @param array<string, mixed> $settings @throws RuntimeException */
    public static function assertSafe(array $settings): void
    {
        $problems = self::problems($settings);
        if ($problems !== []) {
            throw new RuntimeException("Refusing to start with an unsafe configuration:\n - " . implode("\n - ", $problems));
        }
    }
}
