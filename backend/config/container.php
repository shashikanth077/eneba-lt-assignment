<?php

declare(strict_types=1);

use App\Support\Database;
use DI\ContainerBuilder;
use Psr\Container\ContainerInterface;

/** @param array<string, mixed> $settings */
return static function (array $settings): ContainerInterface {
    $builder = new ContainerBuilder();
    $builder->addDefinitions([
        'settings' => $settings,
        // Lazy: the connection opens only when something needs PDO.
        PDO::class => static fn (ContainerInterface $c): PDO => Database::connect($c->get('settings')['db']),
    ]);

    return $builder->build();
};
