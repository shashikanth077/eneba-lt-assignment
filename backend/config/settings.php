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
        'cors' => [
            'origins' => array_values(array_filter(array_map('trim', explode(',', $env('CORS_ALLOWED_ORIGINS', ''))))),
        ],
    ];
};
