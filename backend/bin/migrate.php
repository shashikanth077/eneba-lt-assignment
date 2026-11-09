<?php

declare(strict_types=1);

use App\Support\Migrator;

/** @var Psr\Container\ContainerInterface $container */
$container = require __DIR__ . '/_boot.php';
if (in_array('--create-db', $argv, true) && App\Support\DatabaseBootstrap::ensureExists($container->get('settings')['db'])) {
    echo "Created the database.\n";
}

$applied = (new Migrator($container->get(PDO::class), dirname(__DIR__) . '/database/migrations'))->run();
echo $applied === [] ? "Nothing to migrate.\n" : 'Applied: ' . implode(', ', $applied) . "\n";
