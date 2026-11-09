<?php

declare(strict_types=1);

namespace Tests;

/** REVIEW.md S1, end to end: spoofing X-Forwarded-For must not buy unlimited password guesses. */
final class ProxyThrottleTest extends DbTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('TRUNCATE TABLE login_attempts');
        $_ENV['TRUST_PROXY'] = 'true'; // we run behind one proxy (the default hop count)
    }

    protected function tearDown(): void
    {
        unset($_ENV['TRUST_PROXY']);
        self::$pdo->exec('TRUNCATE TABLE login_attempts');
        parent::tearDown();
    }

    private function guess(int $n, string $forwardedFor): int
    {
        return $this->send('POST', '/api/auth/login', ['email' => 'victim@example.com', 'password' => "guess-$n"], null, '10.9.9.9', ['X-Forwarded-For' => $forwardedFor])->getStatusCode();
    }

    public function testAnAttackerWhoPrependsAFreshFakeAddressEveryTimeIsStillLimited(): void
    {
        $statuses = [];
        foreach (range(1, 8) as $n) {
            // the attacker invents "10.0.0.N"; the proxy appends the address it really saw
            $statuses[] = $this->guess($n, "10.0.0.$n, 203.0.113.9");
        }

        self::assertSame([401, 401, 401, 401, 401, 429, 429, 429], $statuses, 'five guesses, then locked out, whatever the first entry says');
    }

    public function testTwoDifferentRealClientsAreCountedSeparately(): void
    {
        foreach (range(1, 5) as $n) {
            $this->guess($n, '1.1.1.1, 203.0.113.9');
        }

        self::assertSame(429, $this->guess(6, 'x, 203.0.113.9'));
        self::assertSame(401, $this->guess(7, 'x, 203.0.113.10'), 'another real address has its own allowance');
    }
}
