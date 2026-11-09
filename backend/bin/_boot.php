<?php

declare(strict_types=1);

use Dotenv\Dotenv;
use Psr\Container\ContainerInterface;

/** Shared start-up for CLI scripts: autoload, .env, DI container. */
require __DIR__ . '/../vendor/autoload.php';

$root = dirname(__DIR__);
Dotenv::createImmutable($root)->safeLoad();

return (require $root . '/config/container.php')((require $root . '/config/settings.php')());
