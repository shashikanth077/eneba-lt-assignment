<?php

declare(strict_types=1);

namespace App\Support;

use PDO;
use Throwable;

/**
 * "Why does it not work on my machine?" in one command (php bin/doctor.php). Every check returns a status, a short name and, when it is
 * not green, the exact thing to do. The pure checks take their inputs as arguments so they can be tested without a database.
 *
 * @phpstan-type Check array{status: 'pass'|'warn'|'fail', name: string, detail: string}
 */
final class Doctor
{
    public const MIN_PHP = '8.2.0';
    private const REQUIRED_EXTENSIONS = ['pdo_mysql', 'mbstring', 'sodium', 'openssl', 'curl', 'json', 'ctype'];

    /** @return Check */
    public static function php(string $version, string $min = self::MIN_PHP): array
    {
        return version_compare($version, $min, '>=')
            ? self::pass("PHP $version", "needs $min or newer")
            : self::fail("PHP $version", "too old: this project needs PHP $min or newer. In XAMPP use release 8.2 or later, and run the CLI scripts with ITS php.exe (C:\\xampp\\php\\php.exe), not another PHP on your PATH.");
    }

    /**
     * @param callable(string): bool $isLoaded
     * @return list<Check>
     */
    public static function extensions(callable $isLoaded): array
    {
        $checks = [];
        foreach (self::REQUIRED_EXTENSIONS as $extension) {
            $checks[] = $isLoaded($extension)
                ? self::pass("extension $extension", 'loaded')
                : self::fail("extension $extension", "missing: open php.ini (XAMPP: C:\\xampp\\php\\php.ini), remove the ';' in front of extension=$extension, then restart Apache/the terminal. `php --ini` shows which php.ini is used.");
        }

        return $checks;
    }

    /** @return Check */
    public static function argon2id(bool $available): array
    {
        return $available
            ? self::pass('Argon2id password hashing', 'available')
            : self::fail('Argon2id password hashing', 'this PHP build cannot hash with Argon2id, so sign-up and login would fail. Use the PHP that ships with a current XAMPP (8.2+) or a build with sodium/argon2.');
    }

    /**
     * @param array<string, string> $env
     * @return list<Check>
     */
    public static function secrets(array $env): array
    {
        $jwt = $env['JWT_SECRET'] ?? '';
        $key = base64_decode($env['KEY_ENCRYPTION_KEY'] ?? '', true);

        return [
            strlen($jwt) >= 32
                ? self::pass('JWT_SECRET', 'set (' . strlen($jwt) . ' characters)')
                : self::fail('JWT_SECRET', "missing or shorter than 32 characters. Generate one: php -r \"echo bin2hex(random_bytes(32));\" and put it in backend/.env"),
            $key !== false && strlen($key) === \SODIUM_CRYPTO_SECRETBOX_KEYBYTES
                ? self::pass('KEY_ENCRYPTION_KEY', 'valid (32 bytes)')
                : self::fail('KEY_ENCRYPTION_KEY', "missing or not base64 of exactly 32 bytes. Generate one: php -r \"echo base64_encode(random_bytes(32));\". Keep it: keys encrypted with another value cannot be decrypted."),
        ];
    }

    /**
     * The same rules the app enforces at start-up for a public deployment (ConfigGuard), reported as hints on a local machine.
     *
     * @param array<string, mixed> $settings
     * @return Check
     */
    public static function placeholders(array $settings): array
    {
        $usesJwt = in_array($settings['auth']['jwt_secret'], ConfigGuard::KNOWN_JWT_SECRETS, true);
        $usesKey = in_array($settings['keys']['encryption'], ConfigGuard::KNOWN_KEY_ENCRYPTION_KEYS, true);
        if (!$usesJwt && !$usesKey) {
            return self::pass('Placeholder secrets', 'none in use');
        }
        $which = implode(' and ', array_filter([$usesJwt ? 'JWT_SECRET' : null, $usesKey ? 'KEY_ENCRYPTION_KEY' : null]));

        return ConfigGuard::isLocal($settings)
            ? self::warn('Placeholder secrets', "$which still has the public example value. Fine on this machine; the app REFUSES to start with it once APP_URL is a real address.")
            : self::fail('Placeholder secrets', "$which is the public example value on a non-local deployment: the app will not start. See ConfigGuard.");
    }

    /** @return Check */
    public static function stripe(string $secretKey, string $webhookSecret): array
    {
        if ($secretKey === '') {
            return self::warn('Stripe', 'STRIPE_SECRET_KEY is empty: browsing works, but checkout answers 503 until you add a test key (sk_test_...).');
        }
        if (!str_starts_with($secretKey, 'sk_test_')) {
            return self::fail('Stripe', 'STRIPE_SECRET_KEY must be a TEST key (sk_test_...). This project never uses live keys.');
        }

        return $webhookSecret === ''
            ? self::warn('Stripe', 'test key set, but STRIPE_WEBHOOK_SECRET is empty: payments cannot be confirmed. Run `stripe listen` and copy its whsec_... value.')
            : self::pass('Stripe', 'test key and webhook secret set');
    }

    /** @return Check */
    public static function cacheDirectory(string $driver, string $directory): array
    {
        if ($driver === 'none') {
            return self::pass('Cache', 'CACHE_DRIVER=none (homepage block data is read fresh every time: right for development)');
        }
        if (!is_dir($directory)) {
            @mkdir($directory, 0775, true);
        }

        return is_dir($directory) && is_writable($directory)
            ? self::pass('Cache', "file cache in $directory (block data can be up to 10 minutes old; set CACHE_DRIVER=none while developing)")
            : self::warn('Cache', "$directory is not writable, so nothing is cached (the site still works, just slower). Set CACHE_DIR to a writable folder.");
    }

    /**
     * Everything that needs a live connection.
     *
     * @param array<string, mixed> $settings the app settings (config/settings.php)
     * @return list<Check>
     */
    public static function database(PDO $pdo, array $settings, string $migrationsDirectory): array
    {
        $checks = [];
        $version = (string) $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
        $checks[] = self::pass('Database server', $version);

        $strategy = (string) ($settings['db']['lock_strategy'] ?? 'auto');
        $skip = LockStrategy::useSkipLocked($strategy, $version);
        $checks[] = $skip
            ? self::pass('Checkout locking', 'FOR UPDATE SKIP LOCKED (buyers never wait for each other)')
            : self::warn('Checkout locking', "this server ($version) has no SKIP LOCKED (it needs MariaDB 10.6+ or MySQL 8.0.1+), so checkout uses plain FOR UPDATE with deadlock retries. That is correct and safe, buyers just wait a few milliseconds for each other. Upgrade MariaDB/MySQL if you want the better behaviour.");

        $packet = (int) $pdo->query("SHOW VARIABLES LIKE 'max_allowed_packet'")->fetch(PDO::FETCH_NUM)[1];
        $checks[] = $packet >= 1_048_576
            ? self::pass('max_allowed_packet', number_format($packet / 1_048_576, 1) . ' MB')
            : self::warn('max_allowed_packet', "$packet bytes is below 1 MB: the seeder's batched inserts may fail. Set max_allowed_packet=16M in my.ini and restart MySQL.");

        $mode = (string) $pdo->query('SELECT @@sql_mode')->fetchColumn();
        $checks[] = self::pass('sql_mode', $mode === '' ? '(empty: non-strict, still supported)' : $mode);

        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $applied = in_array('schema_migrations', $tables, true) ? $pdo->query('SELECT filename FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN) : [];
        $all = array_map('basename', glob($migrationsDirectory . '/*.sql') ?: []);
        $pending = array_values(array_diff($all, $applied));
        $checks[] = $pending === []
            ? self::pass('Migrations', count($all) . ' applied')
            : self::fail('Migrations', count($pending) . ' not applied yet (' . implode(', ', $pending) . '). Run: php bin/migrate.php');

        if (in_array('products', $tables, true)) {
            $products = (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
            $checks[] = $products > 0
                ? self::pass('Demo data', "$products products seeded")
                : self::warn('Demo data', 'the catalog is empty. Run: php bin/seed.php');
        }

        return $checks;
    }

    /** @return Check */
    public static function pass(string $name, string $detail): array
    {
        return ['status' => 'pass', 'name' => $name, 'detail' => $detail];
    }

    /** @return Check */
    public static function warn(string $name, string $detail): array
    {
        return ['status' => 'warn', 'name' => $name, 'detail' => $detail];
    }

    /** @return Check */
    public static function fail(string $name, string $detail): array
    {
        return ['status' => 'fail', 'name' => $name, 'detail' => $detail];
    }

    /**
     * The full run used by bin/doctor.php.
     *
     * @param array<string, mixed> $settings
     * @param array<string, string> $env
     * @return list<Check>
     */
    public static function run(array $settings, array $env, string $migrationsDirectory): array
    {
        $checks = [self::php(PHP_VERSION), ...self::extensions(extension_loaded(...)), self::argon2id(defined('PASSWORD_ARGON2ID'))];
        $checks[] = is_file(dirname($migrationsDirectory, 2) . '/.env')
            ? self::pass('.env', 'found')
            : self::warn('.env', 'backend/.env not found: using defaults and real environment variables. Copy .env.xampp.example to .env.');
        array_push($checks, ...self::secrets($env));
        $checks[] = self::placeholders($settings);
        $checks[] = self::stripe((string) $settings['stripe']['secret_key'], (string) $settings['stripe']['webhook_secret']);
        $checks[] = self::cacheDirectory((string) $settings['cache']['driver'], (string) $settings['cache']['dir']);

        try {
            $pdo = Database::connect($settings['db']);
            array_push($checks, ...self::database($pdo, $settings, $migrationsDirectory));
        } catch (Throwable $e) {
            $db = $settings['db'];
            $checks[] = self::fail(
                'Database connection',
                sprintf(
                    "cannot connect to %s@%s:%d/%s (%s). Is MySQL started in the XAMPP control panel? Check DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME in backend/.env; XAMPP's default is user root with an empty password. If the database does not exist yet: php bin/setup.php",
                    $db['user'],
                    $db['host'],
                    $db['port'],
                    $db['name'],
                    $e->getMessage(),
                ),
            );
        }

        return $checks;
    }
}
