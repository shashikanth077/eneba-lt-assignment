<?php

declare(strict_types=1);

namespace Tests;

use App\Support\Doctor;
use PHPUnit\Framework\TestCase;

final class DoctorTest extends TestCase
{
    public function testPhpVersionBelowTheMinimumFailsWithAnXamppHint(): void
    {
        self::assertSame('pass', Doctor::php('8.2.0')['status']);
        self::assertSame('pass', Doctor::php('8.3.6')['status']);
        $old = Doctor::php('8.1.30');
        self::assertSame('fail', $old['status']);
        self::assertStringContainsString('xampp', strtolower($old['detail']));
    }

    public function testEachMissingExtensionIsReportedWithTheIniFix(): void
    {
        $checks = Doctor::extensions(static fn (string $name): bool => $name !== 'sodium');
        $failed = array_values(array_filter($checks, static fn (array $c): bool => $c['status'] === 'fail'));
        self::assertCount(1, $failed);
        self::assertSame('extension sodium', $failed[0]['name']);
        self::assertStringContainsString('extension=sodium', $failed[0]['detail']);
        self::assertStringContainsString('php.ini', $failed[0]['detail']);
    }

    public function testSecretsMustBeLongEnoughAndTheEncryptionKeyExactly32Bytes(): void
    {
        $good = Doctor::secrets(['JWT_SECRET' => str_repeat('a', 32), 'KEY_ENCRYPTION_KEY' => base64_encode(random_bytes(32))]);
        self::assertSame(['pass', 'pass'], array_column($good, 'status'));

        $bad = Doctor::secrets(['JWT_SECRET' => 'short', 'KEY_ENCRYPTION_KEY' => base64_encode('too short')]);
        self::assertSame(['fail', 'fail'], array_column($bad, 'status'));

        $missing = Doctor::secrets([]);
        self::assertSame(['fail', 'fail'], array_column($missing, 'status'));
        self::assertSame('fail', Doctor::secrets(['JWT_SECRET' => str_repeat('a', 32), 'KEY_ENCRYPTION_KEY' => '%%%not base64%%%'])[1]['status']);
    }

    public function testStripeAcceptsOnlyTestKeys(): void
    {
        self::assertSame('warn', Doctor::stripe('', '')['status'], 'no key: browsing still works');
        self::assertSame('fail', Doctor::stripe('sk_live_abc', 'whsec_x')['status'], 'a live key is never acceptable');
        self::assertSame('warn', Doctor::stripe('sk_test_abc', '')['status']);
        self::assertSame('pass', Doctor::stripe('sk_test_abc', 'whsec_x')['status']);
    }

    public function testCacheDriverNoneNeedsNoDirectory(): void
    {
        self::assertSame('pass', Doctor::cacheDirectory('none', '/definitely/not/there')['status']);
    }

    public function testAnUnwritableCacheDirectoryIsAWarningNotAFailure(): void
    {
        self::assertSame('warn', Doctor::cacheDirectory('file', '/proc/keymart-cache-' . uniqid())['status']);
        self::assertSame('pass', Doctor::cacheDirectory('file', sys_get_temp_dir() . '/keymart-doctor-' . uniqid())['status']);
    }

    public function testArgon2idMissingIsFatalBecauseLoginWouldBreak(): void
    {
        self::assertSame('fail', Doctor::argon2id(false)['status']);
        self::assertSame('pass', Doctor::argon2id(true)['status']);
    }
}
