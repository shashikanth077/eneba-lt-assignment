<?php

declare(strict_types=1);

use App\Support\Doctor;

/**
 * php bin/doctor.php: checks PHP, extensions, secrets, Stripe keys, the database, migrations and demo data, and says what to fix.
 * Exit code 1 when something that blocks the app is wrong (so it can be used in scripts).
 */
$container = require __DIR__ . '/_boot.php';
$settings = $container->get('settings');
$env = [
    'JWT_SECRET' => $settings['auth']['jwt_secret'],
    'KEY_ENCRYPTION_KEY' => $settings['keys']['encryption'],
];

$checks = Doctor::run($settings, $env, dirname(__DIR__) . '/database/migrations');

$labels = ['pass' => '[ OK ]', 'warn' => '[WARN]', 'fail' => '[FAIL]'];
foreach ($checks as $check) {
    printf("%s %s: %s\n", $labels[$check['status']], $check['name'], $check['detail']);
}
$failed = count(array_filter($checks, static fn (array $c): bool => $c['status'] === 'fail'));
$warned = count(array_filter($checks, static fn (array $c): bool => $c['status'] === 'warn'));
printf("\n%d checks, %d failed, %d warnings\n", count($checks), $failed, $warned);
exit($failed > 0 ? 1 : 0);
