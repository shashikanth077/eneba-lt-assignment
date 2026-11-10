<?php

declare(strict_types=1);

namespace Tests;

/** REVIEW.md S5: plain-text game keys must not be cacheable by anything between the database and the buyer's screen. */
final class SecurityHeadersTest extends ShopTestCase
{
    /** @return array{buyer: array{id: int, token: string}, orderId: int} */
    private function pendingOrder(): array
    {
        $buyer = $this->user('buyer@example.com');
        $this->addToCart($buyer['token'], 1, 2);

        return ['buyer' => $buyer, 'orderId' => $this->checkout($buyer['token'])['orderId']];
    }

    private function assertPrivate(\Psr\Http\Message\ResponseInterface $response, string $what): void
    {
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'), "$what must not be cached");
        self::assertSame('nosniff', $response->getHeaderLine('X-Content-Type-Options'), $what);
        self::assertSame('DENY', $response->getHeaderLine('X-Frame-Options'), $what);
        self::assertSame('no-referrer', $response->getHeaderLine('Referrer-Policy'), $what);
    }

    public function testAPaidOrderWithItsPlainKeysIsNeverCacheable(): void
    {
        $o = $this->pendingOrder();
        $this->pay($o['orderId']);

        $response = $this->call('GET', '/api/orders/' . $o['orderId'], $o['buyer']['token']);
        self::assertSame(200, $response->getStatusCode());
        self::assertArrayHasKey('keys', $this->json($response)['order']['items'][0], 'this response really carries keys');
        $this->assertPrivate($response, 'GET /api/orders/{id}');
    }

    public function testTheRestOfTheAccountSurfaceIsPrivateToo(): void
    {
        $u = $this->user('hdr@example.com');
        foreach (['/api/auth/me', '/api/cart', '/api/orders'] as $path) {
            $response = $this->call('GET', $path, $u['token']);
            self::assertSame(200, $response->getStatusCode(), $path);
            $this->assertPrivate($response, "GET $path");
        }
    }

    public function testErrorResponsesAreCoveredToo(): void
    {
        $this->assertPrivate($this->call('GET', '/api/cart', null), '401 error');
        $this->assertPrivate($this->call('GET', '/api/does-not-exist', null), '404 error');
    }

    public function testResponsesThatChooseTheirOwnCachingAreLeftAlone(): void
    {
        $slug = (string) self::$pdo->query('SELECT slug FROM products LIMIT 1')->fetchColumn();
        $image = $this->call('GET', "/api/images/products/$slug.svg", null);
        self::assertSame(200, $image->getStatusCode());
        self::assertSame('public, max-age=86400', $image->getHeaderLine('Cache-Control'), 'artwork stays cacheable: it is public');
        self::assertSame('nosniff', $image->getHeaderLine('X-Content-Type-Options'));
    }

    public function testHstsIsSentOnlyWhenTheDeploymentIsHttps(): void
    {
        self::assertStringContainsString('max-age=', $this->call('GET', '/api/health', null)->getHeaderLine('Strict-Transport-Security'), 'phpunit.xml runs with COOKIE_SECURE=true');
        $_ENV['COOKIE_SECURE'] = 'false';
        try {
            self::assertSame('', $this->call('GET', '/api/health', null)->getHeaderLine('Strict-Transport-Security'));
        } finally {
            $_ENV['COOKIE_SECURE'] = 'true';
        }
    }
}
