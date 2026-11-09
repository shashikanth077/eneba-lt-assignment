<?php

declare(strict_types=1);

/**
 * DEVELOPMENT/E2E ONLY (lives in tests/, never served). Does what POST /api/checkout does for a user's cart, but with the fake payment
 * gateway, so a browser test can exercise the order page without Stripe: reserves the keys, creates the PENDING order and prints
 * {"orderId", "paymentIntentId", "totalCents"}. The test then plays Stripe's part by sending a signed webhook.
 *
 *   php tests/bin/dev_order.php <user email>
 */

use App\Payment\PaymentGateway;
use App\Services\CheckoutService;
use Dotenv\Dotenv;
use Tests\FakePaymentGateway;

require __DIR__ . '/../../vendor/autoload.php';

$email = $argv[1] ?? throw new InvalidArgumentException('usage: php tests/bin/dev_order.php <user email>');
Dotenv::createImmutable(dirname(__DIR__, 2))->safeLoad();
$settings = (require __DIR__ . '/../../config/settings.php')();
$container = (require __DIR__ . '/../../config/container.php')($settings, [PaymentGateway::class => new FakePaymentGateway()]);

/** @var PDO $pdo */
$pdo = $container->get(PDO::class);
$user = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$user->execute([$email]);
$userId = $user->fetchColumn();
if ($userId === false) {
    fwrite(STDERR, "no such user\n");
    exit(1);
}

$result = $container->get(CheckoutService::class)->checkout((int) $userId);
$intent = $pdo->query('SELECT stripe_payment_intent_id FROM orders WHERE id = ' . (int) $result['orderId'])->fetchColumn();
echo json_encode(['orderId' => $result['orderId'], 'paymentIntentId' => $intent, 'totalCents' => $result['totalCents']], JSON_THROW_ON_ERROR), "\n";
