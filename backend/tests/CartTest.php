<?php

declare(strict_types=1);

namespace Tests;

use PHPUnit\Framework\Attributes\DataProvider;

final class CartTest extends ShopTestCase
{
    public function testEveryCartRouteNeedsASignedInUser(): void
    {
        foreach ([['GET', '/api/cart'], ['POST', '/api/cart'], ['PATCH', '/api/cart/1'], ['DELETE', '/api/cart/1'], ['DELETE', '/api/cart'], ['POST', '/api/checkout'], ['GET', '/api/orders'], ['GET', '/api/orders/1']] as [$method, $path]) {
            $response = $this->send($method, $path, $method === 'POST' || $method === 'PATCH' ? ['offerId' => 1, 'qty' => 1] : null);

            self::assertSame(401, $response->getStatusCode(), "$method $path");
            self::assertSame('unauthorized', $this->json($response)['error']['code']);
        }
    }

    public function testAnEmptyCart(): void
    {
        $buyer = $this->user('a@example.com');

        self::assertSame(['lines' => [], 'totalCents' => 0, 'currency' => 'EUR', 'issues' => []], $this->ok('GET', '/api/cart', $buyer['token']));
    }

    public function testAddingAnOfferShowsLiveNamesPricesAndTotals(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 2);
        $cart = $this->addToCart($buyer['token'], 3, 1);

        self::assertSame(['lines', 'totalCents', 'currency', 'issues'], array_keys($cart));
        self::assertSame(
            ['offerId' => 1, 'productSlug' => 'alpha', 'productName' => 'Alpha', 'sellerName' => 'Seller One', 'unitCents' => 1000, 'qty' => 2, 'lineCents' => 2000, 'available' => 3],
            $cart['lines'][0],
        );
        self::assertSame(2500, $cart['lines'][1]['lineCents']);
        self::assertSame(4500, $cart['totalCents']);
        self::assertSame([], $cart['issues']);
        self::assertSame($cart, $this->ok('GET', '/api/cart', $buyer['token']));
    }

    public function testAddingTheSameOfferAgainRaisesTheQuantity(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 1);
        $cart = $this->addToCart($buyer['token'], 1, 2);

        self::assertCount(1, $cart['lines']);
        self::assertSame(3, $cart['lines'][0]['qty']);
    }

    public function testPatchSetsTheQuantityAndDeleteRemovesALineOrEverything(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 1);
        $this->addToCart($buyer['token'], 2, 1);

        $cart = $this->ok('PATCH', '/api/cart/1', $buyer['token'], ['qty' => 3]);
        self::assertSame(3, $cart['lines'][0]['qty']);
        self::assertSame(3000 + 1200, $cart['totalCents']);

        $cart = $this->ok('DELETE', '/api/cart/1', $buyer['token']);
        self::assertSame([2], array_column($cart['lines'], 'offerId'));

        $cart = $this->ok('DELETE', '/api/cart', $buyer['token']);
        self::assertSame([], $cart['lines']);
    }

    public function testCartsAreIsolatedPerUser(): void
    {
        $a = $this->user('a@example.com');
        $b = $this->user('b@example.com');
        $this->addToCart($a['token'], 1, 2);

        self::assertSame([], $this->ok('GET', '/api/cart', $b['token'])['lines']);
        $this->fails('DELETE', '/api/cart/1', $b['token'], 404, 'not_found');
        $this->fails('PATCH', '/api/cart/1', $b['token'], 404, 'not_found', ['qty' => 1]);
        self::assertSame(2, $this->ok('GET', '/api/cart', $a['token'])['lines'][0]['qty'], "B could not touch A's cart");
    }

    public function testThePriceComesFromTheServerNeverFromTheClient(): void
    {
        $buyer = $this->user('a@example.com');
        $cart = $this->ok('POST', '/api/cart', $buyer['token'], ['offerId' => 1, 'qty' => 1, 'price' => 1, 'priceCents' => 1, 'unitCents' => 1, 'totalCents' => 1], 201);

        self::assertSame(1000, $cart['lines'][0]['unitCents']);

        self::$pdo->exec('UPDATE offers SET price_cents = 1100 WHERE id = 1');
        self::assertSame(1100, $this->ok('GET', '/api/cart', $buyer['token'])['totalCents'], 'a seller price change shows immediately, nothing is frozen in the cart');
    }

    /** @param array<string, mixed> $body */
    #[DataProvider('invalidAdds')]
    public function testInvalidAddsAreRejected(array $body, int $status, string $code): void
    {
        $buyer = $this->user('a@example.com');

        $this->fails('POST', '/api/cart', $buyer['token'], $status, $code, $body);
        self::assertSame([], $this->ok('GET', '/api/cart', $buyer['token'])['lines']);
    }

    /** @return array<string, array{array<string, mixed>, int, string}> */
    public static function invalidAdds(): array
    {
        return [
            'no offerId' => [['qty' => 1], 422, 'validation_failed'],
            'offerId not a number' => [['offerId' => 'abc'], 422, 'validation_failed'],
            'qty 0' => [['offerId' => 1, 'qty' => 0], 422, 'validation_failed'],
            'negative qty' => [['offerId' => 1, 'qty' => -2], 422, 'validation_failed'],
            'qty above the per-line maximum' => [['offerId' => 1, 'qty' => 6], 422, 'validation_failed'],
            'qty not a number' => [['offerId' => 1, 'qty' => 'two'], 422, 'validation_failed'],
            'unknown offer' => [['offerId' => 999], 404, 'not_found'],
            'inactive offer' => [['offerId' => 5], 404, 'not_found'],
            'more than the stock (3 keys)' => [['offerId' => 1, 'qty' => 4], 409, 'insufficient_stock'],
        ];
    }

    public function testStockLimitsTheTotalQuantityAcrossAdds(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 3, 1);

        $error = $this->fails('POST', '/api/cart', $buyer['token'], 409, 'insufficient_stock', ['offerId' => 3, 'qty' => 1]);

        self::assertSame(['offerId' => 3, 'available' => 1], $error['details']);
        $this->fails('PATCH', '/api/cart/3', $buyer['token'], 409, 'insufficient_stock', ['qty' => 2]);
    }

    public function testMaxQuantityAndMaxLinesAreEnforced(): void
    {
        $buyer = $this->user('a@example.com');
        self::$pdo->exec('UPDATE offers SET active = 1 WHERE id = 5');
        $this->addToCart($buyer['token'], 4, 5);
        $error = $this->fails('POST', '/api/cart', $buyer['token'], 422, 'validation_failed', ['offerId' => 4, 'qty' => 1]);
        self::assertSame(['qty'], array_keys($error['details']['fields']), 'a line never exceeds 5 even through repeated adds');

        // 20 different offers is the cap
        $cipher = \App\Support\KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY']);
        for ($id = 100; $id < 119; $id++) {
            self::$pdo->exec("INSERT INTO products (id, slug, name, name_norm, description, genre, publisher, release_date, platform_id, region_id, cover_svg) VALUES ($id, 'p$id', 'P$id', 'p$id', 'd', 'Action', 'P', '2024-01-01', 1, 1, '<svg/>')");
            self::$pdo->exec("INSERT INTO offers (id, product_id, seller_id, price_cents, active) VALUES ($id, $id, 1, 1000, 1)");
            self::$pdo->prepare("INSERT INTO game_keys (offer_id, key_enc, key_hash) VALUES (?,?,?)")->execute([$id, $cipher->encrypt("X$id"), hash('sha256', "X$id")]);
            $this->addToCart($buyer['token'], $id, 1);
        }
        self::assertCount(20, $this->ok('GET', '/api/cart', $buyer['token'])['lines']);

        $this->fails('POST', '/api/cart', $buyer['token'], 422, 'cart_full', ['offerId' => 1, 'qty' => 1]);
    }

    public function testTheCartFlagsLinesThatCannotBeBoughtAnymore(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 3);
        $this->addToCart($buyer['token'], 2, 1);
        $this->addToCart($buyer['token'], 3, 1);

        self::$pdo->exec("UPDATE game_keys SET status = 'sold' WHERE offer_id = 3");              // sold out
        self::$pdo->exec("UPDATE game_keys SET status = 'sold' WHERE offer_id = 1 AND id = (SELECT m FROM (SELECT MIN(id) m FROM game_keys WHERE offer_id = 1) t)"); // 2 of 3 left
        self::$pdo->exec('UPDATE offers SET active = 0 WHERE id = 2');                              // withdrawn

        $cart = $this->ok('GET', '/api/cart', $buyer['token']);

        self::assertSame(
            [[1, 'insufficient_stock'], [2, 'inactive'], [3, 'out_of_stock']],
            array_map(static fn (array $i): array => [$i['offerId'], $i['code']], $cart['issues']),
        );
        self::assertSame(2, $cart['lines'][0]['available']);
        self::assertSame(0, $cart['lines'][2]['available']);
    }

    public function testMutatingCartRoutesNeedTheCsrfHeader(): void
    {
        $buyer = $this->user('a@example.com');

        $response = $this->send('POST', '/api/cart', ['offerId' => 1], $buyer['token'], headers: ['X-Requested-With' => '']);

        self::assertSame(403, $response->getStatusCode());
        self::assertSame('csrf_rejected', $this->json($response)['error']['code']);
    }
}
