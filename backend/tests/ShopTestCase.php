<?php

declare(strict_types=1);

namespace Tests;

use App\Payment\PaymentGateway;
use App\Support\KeyCipher;
use Firebase\JWT\JWT;
use Psr\Http\Message\ResponseInterface;

/**
 * Shared fixture for cart / checkout / webhook / order tests.
 *
 * Offers (all seller 1 or 2, EUR cents) and their keys (plaintext is "KEY-<offer>-<n>", stored encrypted):
 *   1  Alpha   1000   3 keys          2  Alpha   1200   2 keys
 *   3  Bravo   2500   1 key  (the "last key")
 *   4  Cheap     20   5 keys (below the 0.50 minimum)
 *   5  Ghost   1500   2 keys, offer inactive
 */
abstract class ShopTestCase extends DbTestCase
{
    protected FakePaymentGateway $gateway;
    protected const WEBHOOK_SECRET = 'whsec_phpunit_only_secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->gateway = new FakePaymentGateway();
        $this->containerOverrides = [PaymentGateway::class => $this->gateway];
        $this->buildCatalog();
    }

    // ---- users, tokens, HTTP -----------------------------------------------------------------

    /** @return array{id: int, token: string} */
    protected function user(string $email): array
    {
        self::$pdo->prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, 'not-a-real-hash', ?)")->execute([$email, 'Test ' . $email]);
        $id = (int) self::$pdo->lastInsertId();

        return ['id' => $id, 'token' => JWT::encode(['sub' => (string) $id, 'tv' => 0, 'iat' => time(), 'exp' => time() + 3600], (string) $_ENV['JWT_SECRET'], 'HS256')];
    }

    /** @param array<string, mixed>|null $body */
    protected function call(string $method, string $path, ?string $token, ?array $body = null): ResponseInterface
    {
        return $this->send($method, $path, $body, $token);
    }

    /** @param array<string, mixed>|null $body @return array<string, mixed> */
    protected function ok(string $method, string $path, string $token, ?array $body = null, int $status = 200): array
    {
        $response = $this->call($method, $path, $token, $body);
        self::assertSame($status, $response->getStatusCode(), "$method $path => " . $response->getBody());

        return $this->json($response);
    }

    /** @param array<string, mixed>|null $body @return array<string, mixed> */
    protected function fails(string $method, string $path, string $token, int $status, string $code, ?array $body = null): array
    {
        $response = $this->call($method, $path, $token, $body);
        self::assertSame($status, $response->getStatusCode(), "$method $path => " . $response->getBody());
        self::assertSame($code, $this->json($response)['error']['code']);

        return $this->json($response)['error'];
    }

    protected function addToCart(string $token, int $offerId, int $qty = 1): array
    {
        return $this->ok('POST', '/api/cart', $token, ['offerId' => $offerId, 'qty' => $qty], 201);
    }

    /** @return array{orderId: int, clientSecret: string, totalCents: int, currency: string, reservedUntil: string} */
    protected function checkout(string $token): array
    {
        return $this->ok('POST', '/api/checkout', $token, null, 201);
    }

    // ---- webhooks ------------------------------------------------------------------------------

    /** @param array<string, mixed> $extraIntent */
    protected function event(string $eventId, string $type, string $intentId, int $amount, string $currency = 'eur', array $extraIntent = []): array
    {
        return [
            'id' => $eventId,
            'object' => 'event',
            'type' => $type,
            'created' => time(),
            'data' => ['object' => ['id' => $intentId, 'object' => 'payment_intent', 'amount' => $amount, 'amount_received' => $type === 'payment_intent.succeeded' ? $amount : 0, 'currency' => $currency] + $extraIntent],
        ];
    }

    /** Stripe's scheme: t=<unix>,v1=hex(hmac_sha256(secret, "<t>.<raw body>")). */
    protected function signature(string $rawBody, string $secret = self::WEBHOOK_SECRET, ?int $timestamp = null): string
    {
        $t = $timestamp ?? time();

        return "t=$t,v1=" . hash_hmac('sha256', "$t.$rawBody", $secret);
    }

    /** @param array<string, mixed> $event */
    protected function webhook(array $event, ?string $signature = null): ResponseInterface
    {
        $raw = json_encode($event, JSON_THROW_ON_ERROR);

        return $this->sendRaw('POST', '/api/webhooks/stripe', $raw, ['Stripe-Signature' => $signature ?? $this->signature($raw)]);
    }

    /** Pays an order the way Stripe would tell us about it. */
    protected function pay(int $orderId, string $eventId = 'evt_paid_1'): ResponseInterface
    {
        $order = self::$pdo->query("SELECT stripe_payment_intent_id AS pi, total_cents FROM orders WHERE id = $orderId")->fetch();
        $response = $this->webhook($this->event($eventId, 'payment_intent.succeeded', (string) $order['pi'], (int) $order['total_cents']));
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return $response;
    }

    // ---- database helpers ----------------------------------------------------------------------

    /** @return array<string, int> status => number of keys of the offer */
    protected function keyStates(int $offerId): array
    {
        $rows = self::$pdo->query("SELECT status, COUNT(*) n FROM game_keys WHERE offer_id = $offerId GROUP BY status")->fetchAll();

        return array_map('intval', array_column($rows, 'n', 'status'));
    }

    /** @return array<string, mixed> */
    protected function orderRow(int $orderId): array
    {
        return self::$pdo->query("SELECT * FROM orders WHERE id = $orderId")->fetch();
    }

    protected function plainKeys(int $offerId): array
    {
        $cipher = KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY']);
        $keys = [];
        foreach (self::$pdo->query("SELECT key_enc FROM game_keys WHERE offer_id = $offerId ORDER BY id")->fetchAll() as $row) {
            $keys[] = $cipher->decrypt($row['key_enc']);
        }

        return $keys;
    }

    private function buildCatalog(): void
    {
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['stripe_events', 'cart_items', 'order_items', 'game_keys', 'orders', 'deals', 'product_stats', 'offers', 'products', 'sellers', 'regions', 'platforms', 'login_attempts', 'users'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        self::$pdo->exec("INSERT INTO platforms (id, slug, name) VALUES (1,'steam','Steam')");
        self::$pdo->exec("INSERT INTO regions (id, slug, name) VALUES (1,'global','Global')");
        self::$pdo->exec("INSERT INTO sellers (id, name, rating) VALUES (1,'Seller One',4.5),(2,'Seller Two',4.0)");
        foreach ([[1, 'alpha', 'Alpha'], [2, 'bravo', 'Bravo'], [3, 'cheap', 'Cheap'], [4, 'ghost', 'Ghost']] as [$id, $slug, $name]) {
            self::$pdo->prepare('INSERT INTO products (id, slug, name, name_norm, description, genre, publisher, release_date, platform_id, region_id, cover_svg) VALUES (?,?,?,?,?,?,?,?,1,1,?)')
                ->execute([$id, $slug, $name, $slug, "$name description", 'Action', 'Publisher', '2024-01-01', '<svg/>']);
        }

        $cipher = KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY']);
        $offer = self::$pdo->prepare('INSERT INTO offers (id, product_id, seller_id, price_cents, active) VALUES (?,?,?,?,?)');
        $key = self::$pdo->prepare("INSERT INTO game_keys (offer_id, key_enc, key_hash) VALUES (?,?,?)");
        // offer id, product id, seller id, price, active, number of keys
        foreach ([[1, 1, 1, 1000, 1, 3], [2, 1, 2, 1200, 1, 2], [3, 2, 1, 2500, 1, 1], [4, 3, 1, 20, 1, 5], [5, 4, 2, 1500, 0, 2]] as [$id, $product, $seller, $price, $active, $keys]) {
            $offer->execute([$id, $product, $seller, $price, $active]);
            for ($n = 1; $n <= $keys; $n++) {
                $plain = "KEY-$id-$n";
                $key->execute([$id, $cipher->encrypt($plain), KeyCipher::fingerprint($plain)]);
            }
        }
    }
}
