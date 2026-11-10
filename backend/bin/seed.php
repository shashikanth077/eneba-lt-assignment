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
$pdo = $container->get(PDO::class);

(new Migrator($pdo, dirname(__DIR__) . '/database/migrations'))->run(); // make sure the schema exists
// "Empty" means no game keys at all, not just no products: a database imported from railway_import.sql has the catalogue but no keys
// (they are encrypted with this deployment's own KEY_ENCRYPTION_KEY), and every list stays empty until they exist.
if (in_array('--if-empty', $argv, true) && $pdo->query('SELECT 1 FROM game_keys LIMIT 1')->fetchColumn() !== false) {
    echo "Game keys already loaded, seeding skipped (--if-empty).\n";
    exit(0);
}
$started = microtime(true);
$counts = (new DatabaseSeeder($pdo, $container->get(KeyCipher::class)))->run();

echo "Seed complete in " . round(microtime(true) - $started, 2) . "s. Row counts:\n";
foreach ($counts as $table => $count) {
    printf("  %-14s %6d\n", $table, $count);
}
