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
            'lock_strategy' => $env('LOCK_STRATEGY', 'auto'), // auto | skip | wait (see App\Support\LockStrategy)
        ],
        // Only needed when the API is NOT at the root of its host, e.g. XAMPP's http://localhost/keymart/backend/public
        'base_path' => rtrim($env('APP_BASE_PATH', ''), '/'),
        'app_url' => $env('APP_URL'),
        'auth' => [
            'jwt_secret' => $env('JWT_SECRET'),
            'ttl_seconds' => (int) $env('JWT_TTL_SECONDS', '86400'),
            'cookie_secure' => filter_var($env('COOKIE_SECURE', 'true'), FILTER_VALIDATE_BOOLEAN),
            // TRUST_PROXY=true means "we run behind TRUSTED_PROXY_HOPS proxies" (Render: 1). 0 = ignore X-Forwarded-For entirely.
            'trusted_proxies' => filter_var($env('TRUST_PROXY', 'false'), FILTER_VALIDATE_BOOLEAN) ? max(1, (int) $env('TRUSTED_PROXY_HOPS', '1')) : 0,
            'login_max_per_email' => (int) $env('LOGIN_MAX_FAILURES_PER_EMAIL', '5'),
            'login_max_per_ip' => (int) $env('LOGIN_MAX_FAILURES_PER_IP', '20'),
            'login_window_seconds' => (int) $env('LOGIN_WINDOW_SECONDS', '900'),
        ],
        'stripe' => [
            'secret_key' => $env('STRIPE_SECRET_KEY'),            // sk_test_...
            'webhook_secret' => $env('STRIPE_WEBHOOK_SECRET'),    // whsec_... (from `stripe listen` or the dashboard endpoint)
            'webhook_tolerance' => (int) $env('STRIPE_WEBHOOK_TOLERANCE', '300'),
        ],
        'checkout' => [
            'currency' => strtolower($env('CHECKOUT_CURRENCY', 'eur')),
            'reservation_minutes' => (int) $env('RESERVATION_MINUTES', '15'),
        ],
        // Abuse limits (App\Support\RateLimiter): requests allowed per window and subject. 0 disables one limit.
        'rate_limits' => [
            'enabled' => filter_var($env('RATE_LIMITS_ENABLED', 'true'), FILTER_VALIDATE_BOOLEAN),
            'register_per_hour_per_ip' => (int) $env('RATE_LIMIT_REGISTER_PER_HOUR', '10'),
            'checkout_per_10min_per_user' => (int) $env('RATE_LIMIT_CHECKOUT_PER_10MIN', '10'),
            'search_per_minute_per_ip' => (int) $env('RATE_LIMIT_SEARCH_PER_MINUTE', '240'),
        ],
        'cache' => [
            'driver' => $env('CACHE_DRIVER', 'file'), // file | none
            'dir' => $env('CACHE_DIR', sys_get_temp_dir() . '/keymart-cache'),
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
