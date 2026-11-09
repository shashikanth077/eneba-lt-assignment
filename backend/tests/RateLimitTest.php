<?php

declare(strict_types=1);

namespace Tests;

use App\Exceptions\ApiException;
use App\Support\RateLimiter;

/**
 * REVIEW.md S3. Registration costs an Argon2id hash and makes an account that can hold stock, checkout locks stock for 15 minutes, and
 * /search scans the whole catalogue: all three were open to unlimited, scriptable use.
 */
final class RateLimitTest extends ShopTestCase
{
    private const ENV = ['RATE_LIMIT_REGISTER_PER_HOUR', 'RATE_LIMIT_CHECKOUT_PER_10MIN', 'RATE_LIMIT_SEARCH_PER_MINUTE'];

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('TRUNCATE TABLE rate_limits');
        self::$pdo->exec('TRUNCATE TABLE login_attempts');
        $_ENV['RATE_LIMIT_REGISTER_PER_HOUR'] = '3';
        $_ENV['RATE_LIMIT_CHECKOUT_PER_10MIN'] = '2';
        $_ENV['RATE_LIMIT_SEARCH_PER_MINUTE'] = '4';
    }

    protected function tearDown(): void
    {
        foreach (self::ENV as $name) {
            $_ENV[$name] = '100000'; // back to the generous phpunit.xml value for the next test class
        }
        self::$pdo->exec('TRUNCATE TABLE rate_limits');
        parent::tearDown();
    }

    private function register(int $n, string $ip): int
    {
        return $this->send('POST', '/api/auth/register', ['email' => "bulk$n@example.com", 'password' => 'correct horse 9', 'displayName' => "Bulk $n"], null, $ip)->getStatusCode();
    }

    // ---- the limiter itself ------------------------------------------------------------------

    public function testItCountsInFixedWindowsAndTellsWhenToComeBack(): void
    {
        $limiter = new RateLimiter(self::$pdo);
        $start = 1_000_000_000 - (1_000_000_000 % 60); // the beginning of a minute
        $limiter->hit('t', 'a', 2, 60, $start + 5);
        $limiter->hit('t', 'a', 2, 60, $start + 6);
        try {
            $limiter->hit('t', 'a', 2, 60, $start + 20);
            self::fail('the third request in the window must be refused');
        } catch (ApiException $e) {
            self::assertSame(429, $e->status());
            self::assertSame('rate_limited', $e->errorCode());
            self::assertSame(40, $e->details()['retryAfterSeconds'], 'the window ends 40 s later');
        }
        $limiter->hit('t', 'a', 2, 60, $start + 60); // next window: allowed again
        $limiter->hit('t', 'b', 2, 60, $start + 20); // somebody else: not affected
    }

    public function testADisabledLimiterOrALimitOfZeroNeverBlocks(): void
    {
        $off = new RateLimiter(self::$pdo, false);
        for ($i = 0; $i < 20; $i++) {
            $off->hit('t', 'a', 1, 60);
        }
        $zero = new RateLimiter(self::$pdo);
        for ($i = 0; $i < 20; $i++) {
            $zero->hit('t', 'a', 0, 60);
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM rate_limits')->fetchColumn());
    }

    public function testOldWindowsAreForgotten(): void
    {
        $limiter = new RateLimiter(self::$pdo);
        $limiter->hit('t', 'old', 5, 60, 1_000_000_000);
        $limiter->hit('t', 'new', 5, 60, 1_000_000_000 + 3 * 86400); // a first hit of a window cleans up
        self::assertSame(['new'], self::$pdo->query('SELECT subject FROM rate_limits')->fetchAll(\PDO::FETCH_COLUMN));
    }

    // ---- over HTTP ---------------------------------------------------------------------------

    public function testRegistrationIsLimitedPerAddressAndSaysWhenToRetry(): void
    {
        self::assertSame([201, 201, 201], [$this->register(1, '10.7.0.1'), $this->register(2, '10.7.0.1'), $this->register(3, '10.7.0.1')]);

        $blocked = $this->send('POST', '/api/auth/register', ['email' => 'bulk4@example.com', 'password' => 'correct horse 9', 'displayName' => 'Bulk 4'], null, '10.7.0.1');
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame('rate_limited', $this->json($blocked)['error']['code']);
        self::assertGreaterThan(0, (int) $blocked->getHeaderLine('Retry-After'));
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM users WHERE email = 'bulk4@example.com'")->fetchColumn(), 'the refused request created nothing');

        self::assertSame(201, $this->register(5, '10.7.0.2'), 'another address is not affected');
    }

    public function testCheckoutIsLimitedPerAccountNotPerAddress(): void
    {
        $a = $this->user('rl-a@example.com');
        $b = $this->user('rl-b@example.com');
        // an empty cart answers 422, which still counts as an attempt: what is limited is how often a buyer can try to reserve stock
        $this->fails('POST', '/api/checkout', $a['token'], 422, 'cart_empty');
        $this->fails('POST', '/api/checkout', $a['token'], 422, 'cart_empty');
        $this->fails('POST', '/api/checkout', $a['token'], 429, 'rate_limited');

        $this->fails('POST', '/api/checkout', $b['token'], 422, 'cart_empty'); // same address, other account: own allowance
    }

    public function testSearchEndpointsShareOneAllowancePerAddress(): void
    {
        $codes = [];
        foreach (['/api/search?q=witcher', '/api/search/suggest?q=wit', '/api/search?q=elden', '/api/search/suggest?q=ele', '/api/search?q=ring'] as $path) {
            $codes[] = $this->send('GET', $path, null, null, '10.7.0.9')->getStatusCode();
        }
        self::assertSame([200, 200, 200, 200, 429], $codes);
        self::assertSame(200, $this->send('GET', '/api/products', null, null, '10.7.0.9')->getStatusCode(), 'browsing the catalogue is not limited');
        self::assertSame(200, $this->send('GET', '/api/search?q=ring', null, null, '10.7.0.10')->getStatusCode());
    }

    public function testParallelBurstsCannotGetMoreThanTheLimitThrough(): void
    {
        $limiter = new RateLimiter(self::$pdo);
        $second = new RateLimiter(self::countingPdo()); // a second connection, as a second PHP worker would have
        $allowed = 0;
        foreach (range(1, 12) as $i) {
            try {
                ($i % 2 === 0 ? $limiter : $second)->hit('burst', 'x', 5, 3600);
                $allowed++;
            } catch (ApiException) {
            }
        }
        self::assertSame(5, $allowed);
    }
}
