<?php

declare(strict_types=1);

use App\Support\KeyCipher;
use App\Support\Migrator;
use Database\Seeds\DatabaseSeeder;

/** @var Psr\Container\ContainerInterface $container */
$container = require __DIR__ . '/_boot.php';
if (in_array('--create-db', $argv, true) && App\Support\DatabaseBootstrap::ensureExists($container->get('settings')['db'])) {
    echo "Created the database.\n";
}
$db = $container->get('settings')['db'];
printf("Database: %s@%s:%d/%s\n", $db['user'], $db['host'], $db['port'], $db['name']); // so nobody seeds the wrong one by accident; never the password
$pdo = $container->get(PDO::class);

(new Migrator($pdo, dirname(__DIR__) . '/database/migrations'))->run(); // make sure the schema exists
// "Empty" means no AVAILABLE game key, not just no products: a database imported from railway_import.sql has the catalogue but no keys
// (they are encrypted with this deployment's own KEY_ENCRYPTION_KEY), and every list stays empty until they exist. Looking only for
// *any* key row would leave a database stuck whose keys are all sold or reserved. The seeder itself never refills an offer that has keys.
if (in_array('--if-empty', $argv, true) && $pdo->query("SELECT 1 FROM game_keys WHERE status = 'available' LIMIT 1")->fetchColumn() !== false) {
    echo "Game keys already available, seeding skipped (--if-empty).\n";
    exit(0);
}
$started = microtime(true);
$counts = (new DatabaseSeeder($pdo, $container->get(KeyCipher::class)))->run();

echo "Seed complete in " . round(microtime(true) - $started, 2) . "s. Row counts:\n";
foreach ($counts as $table => $count) {
    printf("  %-14s %6d\n", $table, $count);
}
$available = (int) $pdo->query("SELECT COUNT(*) FROM game_keys WHERE status = 'available'")->fetchColumn();
echo "Available game keys: $available" . ($available === 0 ? " (NOTHING is buyable: check the database connection and KEY_ENCRYPTION_KEY)\n" : "\n");
