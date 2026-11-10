<?php

declare(strict_types=1);

namespace Tests;

use App\Support\ClientIp;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * REVIEW.md S1. The per-IP login limiter is only as good as this function. A client can send any X-Forwarded-For it likes; a
 * trusted proxy APPENDS the address it saw. So the only reliable entry is counted from the right, by the number of proxies we trust.
 */
final class ClientIpTest extends TestCase
{
    private function ip(string $forwarded, int $hops, string $remote = '10.1.1.1'): string
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/auth/login', ['REMOTE_ADDR' => $remote]);
        if ($forwarded !== '') {
            $request = $request->withHeader('X-Forwarded-For', $forwarded);
        }

        return ClientIp::from($request, $hops);
    }

    public function testWithoutATrustedProxyTheHeaderIsIgnoredCompletely(): void
    {
        self::assertSame('10.1.1.1', $this->ip('6.6.6.6', 0));
    }

    public function testTheSpoofedFirstEntryIsIgnoredBecauseTheProxyAppendsTheRealAddress(): void
    {
        // the attacker sent "1.2.3.4"; the load balancer saw 203.0.113.9 and appended it
        self::assertSame('203.0.113.9', $this->ip('1.2.3.4, 203.0.113.9', 1));
        // and a differently spoofed value every time still resolves to the same real client, so the limiter keeps counting
        self::assertSame('203.0.113.9', $this->ip('9.9.9.9, 8.8.8.8, 203.0.113.9', 1));
    }

    public function testTwoTrustedProxiesCountTwoEntriesFromTheRight(): void
    {
        // client -> CDN (appends client) -> load balancer (appends the CDN)
        self::assertSame('203.0.113.9', $this->ip('7.7.7.7, 203.0.113.9, 198.51.100.2', 2));
    }

    public function testFewerEntriesThanTrustedProxiesMeansTheHeaderCannotBeTrusted(): void
    {
        self::assertSame('10.1.1.1', $this->ip('203.0.113.9', 2));
    }

    public function testGarbageOrMissingHeaderFallsBackToTheConnectionAddress(): void
    {
        self::assertSame('10.1.1.1', $this->ip('', 1));
        self::assertSame('10.1.1.1', $this->ip('not-an-ip', 1));
        self::assertSame('10.1.1.1', $this->ip('203.0.113.9, <script>', 1));
    }

    public function testIpv6AndPortlessValuesAreAccepted(): void
    {
        self::assertSame('2001:db8::1', $this->ip('1.1.1.1, 2001:db8::1', 1));
    }
}
