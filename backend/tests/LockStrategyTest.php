<?php

declare(strict_types=1);

namespace Tests;

use App\Support\LockStrategy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class LockStrategyTest extends TestCase
{
    /** @return array<string, array{string, bool}> */
    public static function versions(): array
    {
        return [
            'MySQL 5.7' => ['5.7.44', false],
            'MySQL 8.0.0 (before SKIP LOCKED)' => ['8.0.0', false],
            'MySQL 8.0.1' => ['8.0.1', true],
            'MySQL 8.0.35' => ['8.0.35', true],
            'MySQL 8.4 commercial' => ['8.4.0-commercial', true],
            'MySQL 9' => ['9.0.1', true],
            'MariaDB 10.4 (XAMPP 7.4-8.0)' => ['10.4.32-MariaDB', false],
            'MariaDB 10.4 as the client sees it' => ['5.5.5-10.4.32-MariaDB', false],
            'MariaDB 10.5' => ['10.5.23-MariaDB', false],
            'MariaDB 10.6' => ['10.6.0-MariaDB', true],
            'MariaDB 10.11 (XAMPP 8.2+)' => ['10.11.14-MariaDB-0ubuntu0.24.04.1', true],
            'MariaDB 10.6 as the client sees it' => ['5.5.5-10.6.16-MariaDB', true],
            'MariaDB 11' => ['11.4.2-MariaDB', true],
            'unreadable version: do not assume' => ['garbage', false],
            'empty version' => ['', false],
        ];
    }

    #[DataProvider('versions')]
    public function testAutoPicksTheStrategyFromTheServerVersion(string $version, bool $expected): void
    {
        self::assertSame($expected, LockStrategy::useSkipLocked('auto', $version));
        self::assertSame($expected, LockStrategy::useSkipLocked('', $version), 'empty means auto');
    }

    public function testTheSettingOverridesTheVersion(): void
    {
        self::assertTrue(LockStrategy::useSkipLocked('skip', '10.4.32-MariaDB'));
        self::assertFalse(LockStrategy::useSkipLocked('wait', '8.0.35'));
        self::assertFalse(LockStrategy::useSkipLocked(' WAIT ', '8.0.35'), 'case and spaces are forgiven');
    }

    public function testAnUnknownSettingFailsLoudly(): void
    {
        $this->expectException(RuntimeException::class);
        LockStrategy::useSkipLocked('fast', '8.0.35');
    }
}
