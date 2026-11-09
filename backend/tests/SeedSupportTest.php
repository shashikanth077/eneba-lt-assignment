<?php

declare(strict_types=1);

namespace Tests;

use App\Support\KeyCipher;
use Database\Seeds\Prng;
use PHPUnit\Framework\TestCase;

final class SeedSupportTest extends TestCase
{
    public function testPrngIsDeterministicAndSeedSensitive(): void
    {
        $a = new Prng(42);
        $b = new Prng(42);
        $c = new Prng(43);

        $sequenceA = array_map(static fn () => $a->int(0, 1000), range(1, 20));

        self::assertSame($sequenceA, array_map(static fn () => $b->int(0, 1000), range(1, 20)));
        self::assertNotSame($sequenceA, array_map(static fn () => $c->int(0, 1000), range(1, 20)));
    }

    public function testKeyCipherRoundTripsAndNeverStoresPlaintext(): void
    {
        $cipher = KeyCipher::fromBase64(base64_encode(random_bytes(32)));
        $plain = 'ABCDE-FGHJK-LMNPQ';

        $one = $cipher->encrypt($plain);
        $two = $cipher->encrypt($plain);

        self::assertNotSame($one, $two, 'random nonce per encryption');
        self::assertStringNotContainsString('ABCDE', $one);
        self::assertSame($plain, $cipher->decrypt($one));
        self::assertSame(hash('sha256', $plain), KeyCipher::fingerprint($plain));
    }

    public function testKeyCipherRejectsWrongKeyAndBadKeyLength(): void
    {
        $encrypted = KeyCipher::fromBase64(base64_encode(random_bytes(32)))->encrypt('ABCDE-FGHJK-LMNPQ');

        $this->expectException(\RuntimeException::class);
        KeyCipher::fromBase64(base64_encode(random_bytes(32)))->decrypt($encrypted);
    }

    public function testKeyCipherRequiresA32ByteKey(): void
    {
        $this->expectException(\RuntimeException::class);
        KeyCipher::fromBase64(base64_encode('too short'));
    }
}
