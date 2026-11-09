<?php

declare(strict_types=1);

/**
 * Child process for ConcurrencyTest: one real OS process = one real, independent database connection.
 *
 *   php shop_race.php checkout <userId>  <startAt> <dbName>   -> runs a checkout for that user
 *   php shop_race.php event    <jsonFile> <startAt> <dbName>  -> applies a (pre-verified) Stripe event from a JSON file
 *
 * Everything is set up first, then the process waits until <startAt> (a shared wall-clock time) so all racers fire together.
 * Prints exactly one JSON line.
 */

use App\Exceptions\ApiException;
use App\Payment\PaymentGateway;
use App\Services\CheckoutService;
use App\Services\PaymentEventService;
use Dotenv\Dotenv;
use Tests\FakePaymentGateway;

require __DIR__ . '/../../vendor/autoload.php';

[, $mode, $arg, $startAt, $dbName] = $argv;
$_ENV['DB_NAME'] = $dbName;
Dotenv::createImmutable(dirname(__DIR__, 2))->safeLoad();

$settings = (require __DIR__ . '/../../config/settings.php')();
$container = (require __DIR__ . '/../../config/container.php')($settings, [PaymentGateway::class => new FakePaymentGateway()]);

try {
    $container->get(PDO::class); // connect before the starting gun
    $work = match ($mode) {
        'checkout' => static fn (): array => ['ok' => true, 'orderId' => $container->get(CheckoutService::class)->checkout((int) $arg)['orderId']],
        'event' => static fn (): array => ['ok' => true, 'outcome' => $container->get(PaymentEventService::class)->handle(json_decode((string) file_get_contents($arg), true))],
        default => throw new InvalidArgumentException("unknown mode $mode"),
    };
    while (microtime(true) < (float) $startAt) {
        usleep(200);
    }
    $result = $work();
} catch (ApiException $e) {
    $result = ['ok' => false, 'code' => $e->errorCode()];
} catch (Throwable $e) {
    $result = ['ok' => false, 'code' => 'exception', 'message' => $e::class . ': ' . $e->getMessage()];
}

echo json_encode($result), "\n";
