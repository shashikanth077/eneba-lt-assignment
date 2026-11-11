<?php

declare(strict_types=1);

namespace Tests;

use App\Support\Log;
use PHPUnit\Framework\TestCase;

final class LogTest extends TestCase
{
    /** @var list<array<string, mixed>> */
    private array $lines = [];

    protected function setUp(): void
    {
        $this->lines = [];
        Log::reset();
        Log::configure('debug');
        Log::setSink(function (string $line): void {
            $this->lines[] = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
        });
    }

    protected function tearDown(): void
    {
        Log::setSink(null);
        Log::reset();
        Log::configure('off');
    }

    public function testALineIsOneJsonObjectWithLevelEventMessageAndTheRequestContext(): void
    {
        Log::addContext('request_id', 'abc12345');
        Log::warn('cart.stock.insufficient', 'only 2 left', ['offer_id' => 7, 'wanted' => 5]);

        self::assertCount(1, $this->lines);
        $line = $this->lines[0];
        self::assertSame(['warn', 'cart.stock.insufficient', 'only 2 left', 'abc12345', 7, 5], [$line['level'], $line['event'], $line['msg'], $line['request_id'], $line['offer_id'], $line['wanted']]);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $line['ts']);
    }

    public function testSecretsAreRedactedByNameAtAnyDepth(): void
    {
        Log::info('x.y', 'z', [
            'password' => 'hunter2',
            'client_secret' => 'pi_123_secret_abc',
            'token' => 'abc',
            'Authorization' => 'Bearer x',
            'game_key' => 'AAAAA-BBBBB-CCCCC',
            'nested' => ['stripe_signature' => 'v1=abc', 'order_id' => 5],
            'order_id' => 9,
        ]);

        $line = $this->lines[0];
        foreach (['password', 'client_secret', 'token', 'Authorization', 'game_key'] as $name) {
            self::assertSame('[redacted]', $line[$name], $name);
        }
        self::assertSame('[redacted]', $line['nested']['stripe_signature']);
        self::assertSame([5, 9], [$line['nested']['order_id'], $line['order_id']], 'harmless fields stay');
        self::assertStringNotContainsString('hunter2', json_encode($line, JSON_THROW_ON_ERROR));
    }

    public function testLevelsBelowTheConfiguredOneAreDropped(): void
    {
        Log::configure('warn');
        Log::debug('a.b', 'no');
        Log::info('a.b', 'no');
        Log::warn('a.b', 'yes');
        Log::error('a.b', 'yes');

        self::assertSame(['warn', 'error'], array_column($this->lines, 'level'));
        Log::configure('off');
        Log::error('a.b', 'silent');
        self::assertCount(2, $this->lines);
        Log::configure('nonsense');
        Log::info('a.b', 'unknown level falls back to info');
        self::assertCount(3, $this->lines);
    }

    public function testAnExceptionBecomesItsClassAndMessageAndLongValuesAreCut(): void
    {
        Log::error('app.unhandled', 'boom', ['error' => new \RuntimeException('database gone'), 'blob' => str_repeat('x', 1000), 'obj' => new \stdClass()]);

        $line = $this->lines[0];
        self::assertSame('RuntimeException: database gone', $line['error']);
        self::assertLessThan(320, strlen($line['blob']));
        self::assertSame('stdClass', $line['obj']);
    }

    public function testMaskedAddressesCannotBeContacted(): void
    {
        self::assertSame('a***@example.com', Log::maskEmail('ana@example.com'));
        self::assertSame('***', Log::maskEmail('not an address'));
    }

    public function testABrokenSinkNeverBreaksTheCaller(): void
    {
        Log::setSink(static function (): void {
            throw new \RuntimeException('disk full');
        });

        Log::error('a.b', 'still fine');

        self::assertTrue(true); // reaching this line is the assertion: no exception escaped
    }
}
