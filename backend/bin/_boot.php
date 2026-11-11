<?php

declare(strict_types=1);

use Dotenv\Dotenv;
use Psr\Container\ContainerInterface;

/** Shared start-up for CLI scripts: autoload, .env, DI container. */
require __DIR__ . '/../vendor/autoload.php';

$root = dirname(__DIR__);
Dotenv::createImmutable($root)->safeLoad();

$settings = (require $root . '/config/settings.php')();
App\Support\Log::configure($settings['log']['level']);

return (require $root . '/config/container.php')($settings);
