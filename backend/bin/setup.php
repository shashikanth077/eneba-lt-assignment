<?php

declare(strict_types=1);

use App\Support\DatabaseBootstrap;
use App\Support\KeyCipher;
use App\Support\Migrator;
use Database\Seeds\DatabaseSeeder;

/**
 * First-run setup in one command (XAMPP or anything else):
 *
 *   php bin/setup.php               create the database if missing, run migrations, load the demo data
 *   php bin/setup.php --no-seed     same, without the demo data
 *   php bin/setup.php --test-db     also create and migrate <DB_NAME>_test (used by PHPUnit)
 *
 * Safe to run again: existing tables are kept, the seeder is idempotent.
 */
$container = require __DIR__ . '/_boot.php';
$settings = $container->get('settings');
$flags = array_slice($argv, 1);
$known = ['--no-seed', '--test-db'];
if ($unknown = array_diff($flags, $known)) {
    fwrite(STDERR, 'Unknown option: ' . implode(', ', $unknown) . "\nUsage: php bin/setup.php [--no-seed] [--test-db]\n");
    exit(2);
}

$migrations = dirname(__DIR__) . '/database/migrations';
$targets = [$settings['db']];
if (in_array('--test-db', $flags, true)) {
    $targets[] = ['name' => $settings['db']['name'] . '_test'] + $settings['db'];
}

try {
    foreach ($targets as $db) {
        $created = DatabaseBootstrap::ensureExists($db);
        echo ($created ? 'Created database ' : 'Database exists: ') . $db['name'] . "\n";
        $pdo = App\Support\Database::connect($db);
        $applied = (new Migrator($pdo, $migrations))->run();
        echo '  migrations: ' . ($applied === [] ? 'already up to date' : implode(', ', $applied)) . "\n";
    }

    if (!in_array('--no-seed', $flags, true)) {
        $pdo = App\Support\Database::connect($settings['db']);
        $counts = (new DatabaseSeeder($pdo, $container->get(KeyCipher::class)))->run();
        echo "Demo data loaded:\n";
        foreach ($counts as $table => $count) {
            printf("  %-14s %6d\n", $table, $count);
        }
    }
} catch (Throwable $e) {
    fwrite(STDERR, "\nSetup failed: " . $e->getMessage() . "\n");
    fwrite(STDERR, "Is MySQL started in the XAMPP control panel? Check DB_HOST/DB_PORT/DB_USER/DB_PASS in backend/.env (XAMPP default: user root, empty password).\n");
    fwrite(STDERR, "Run `php bin/doctor.php` for a full diagnosis.\n");
    exit(1);
}

echo "\nNext: php bin/doctor.php to check everything, then start the API (see docs/XAMPP.md).\n";
