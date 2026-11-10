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
if (in_array('--if-empty', $argv, true) && (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn() > 0) {
    echo "Catalogue already loaded, seeding skipped (--if-empty).\n";
    exit(0);
}
$started = microtime(true);
$counts = (new DatabaseSeeder($pdo, $container->get(KeyCipher::class)))->run();

echo "Seed complete in " . round(microtime(true) - $started, 2) . "s. Row counts:\n";
foreach ($counts as $table => $count) {
    printf("  %-14s %6d\n", $table, $count);
}
