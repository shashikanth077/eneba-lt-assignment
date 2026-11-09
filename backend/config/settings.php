<?php

declare(strict_types=1);

/**
 * All configuration comes from environment variables (see .env.example).
 * @return array<string, mixed>
 */
return static function (): array {
    $env = static fn (string $key, string $default = ''): string => (string) ($_ENV[$key] ?? getenv($key) ?: $default);

    return [
        'env' => $env('APP_ENV', 'production'),
        'debug' => filter_var($env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN),
        'db' => [
            'host' => $env('DB_HOST', '127.0.0.1'),
            'port' => (int) $env('DB_PORT', '3306'),
            'name' => $env('DB_NAME', 'keymart'),
            'user' => $env('DB_USER', 'keymart'),
            'pass' => $env('DB_PASS', ''),
        ],
        'app_url' => $env('APP_URL'),
        'auth' => [
            'jwt_secret' => $env('JWT_SECRET'),
            'ttl_seconds' => (int) $env('JWT_TTL_SECONDS', '86400'),
            'cookie_secure' => filter_var($env('COOKIE_SECURE', 'true'), FILTER_VALIDATE_BOOLEAN),
            'trust_proxy' => filter_var($env('TRUST_PROXY', 'false'), FILTER_VALIDATE_BOOLEAN),
            'login_max_per_email' => (int) $env('LOGIN_MAX_FAILURES_PER_EMAIL', '5'),
            'login_max_per_ip' => (int) $env('LOGIN_MAX_FAILURES_PER_IP', '20'),
            'login_window_seconds' => (int) $env('LOGIN_WINDOW_SECONDS', '900'),
        ],
        'keys' => [
            // base64 of 32 random bytes; encrypts game keys at rest
            'encryption' => $env('KEY_ENCRYPTION_KEY'),
        ],
        'cors' => [
            'origins' => array_values(array_filter(array_map('trim', explode(',', $env('CORS_ALLOWED_ORIGINS', ''))))),
        ],
    ];
};
