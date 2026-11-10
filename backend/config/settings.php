<?php

declare(strict_types=1);

/**
 * All configuration comes from environment variables (see .env.example).
 * @return array<string, mixed>
 */
return static function (): array {
    $env = static fn (string $key, string $default = ''): string => (string) ($_ENV[$key] ?? getenv($key) ?: $default);

    // Database variables: DB_* (as before) or MYSQL_* (same meaning), so one connection serves XAMPP and Railway; only the values differ.
    $db = static fn (string $name, string $default = ''): string => $env('DB_' . $name) !== '' ? $env('DB_' . $name) : $env('MYSQL_' . $name, $default);
    $local = in_array($env('APP_ENV', 'production'), ['local', 'test'], true);

    return [
        'env' => $env('APP_ENV', 'production'),
        'debug' => filter_var($env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN),
        'db' => [
            // Localhost is only a default for local development; a deployment must name its database host (ConfigGuard checks).
            'host' => $db('HOST', $local ? '127.0.0.1' : ''),
            'port' => (int) $db('PORT', '3306'),
            // MYSQL_DATABASE / DB_NAME, MYSQL_USER / DB_USER, MYSQL_PASSWORD / DB_PASS
            'name' => $env('DB_NAME') !== '' ? $env('DB_NAME') : $env('MYSQL_DATABASE', 'keymart'),
            'user' => $db('USER', 'keymart'),
            'pass' => $env('DB_PASS') !== '' ? $env('DB_PASS') : $env('MYSQL_PASSWORD'),
            // Managed MySQL hosts require TLS. DB_SSL=true turns it on and verifies the server certificate against DB_SSL_CA (a file path,
            // for hosts with their own CA) or, when that is empty, the system's CA bundle. DB_SSL_VERIFY=false skips verification (weaker).
            'ssl' => filter_var($env('DB_SSL', 'false'), FILTER_VALIDATE_BOOLEAN),
            'ssl_ca' => $env('DB_SSL_CA'),
            'ssl_verify' => filter_var($env('DB_SSL_VERIFY', 'true'), FILTER_VALIDATE_BOOLEAN),
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
        // E-mail through EmailJS (docs/EMAIL.md). Empty service/template/keys = e-mails are skipped, the app works the same.
        'mail' => [
            'service_id' => $env('EMAILJS_SERVICE_ID'),
            'auth_template_id' => $env('EMAILJS_AUTH_TEMPLATE_ID'),
            'public_key' => $env('EMAILJS_PUBLIC_KEY'),
            'private_key' => $env('EMAILJS_PRIVATE_KEY'), // server only, never sent to the browser
            'company_name' => $env('MAIL_COMPANY_NAME', 'KEYMART'),
            'support_email' => $env('SUPPORT_EMAIL', 'support@keymart.example'),
            'verification_ttl_hours' => (int) $env('EMAIL_VERIFICATION_TTL_HOURS', '24'),
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
            'resend_verification_per_hour' => (int) $env('RATE_LIMIT_RESEND_VERIFICATION_PER_HOUR', '5'),
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
