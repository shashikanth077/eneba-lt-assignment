<?php

declare(strict_types=1);

namespace Tests;

use PHPUnit\Framework\TestCase;

/** One connection, two naming styles: DB_* and MYSQL_* mean the same, and DB_* wins when both are set. */
final class DatabaseSettingsTest extends TestCase
{
    /** @var list<string> */
    private const VARS = ['APP_ENV', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_URL'];

    /** @var array<string, string|false> */
    private array $saved = [];

    /** @var array<string, string> */
    private array $savedEnv = [];

    protected function setUp(): void
    {
        foreach (self::VARS as $name) {
            $this->saved[$name] = getenv($name);
            if (isset($_ENV[$name])) {
                $this->savedEnv[$name] = $_ENV[$name];
            }
            putenv($name);
            unset($_ENV[$name]);
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->saved as $name => $value) {
            $value === false ? putenv($name) : putenv("$name=$value");
        }
        $_ENV = $this->savedEnv + $_ENV; // other test classes read the values Dotenv put here
    }

    /** @param array<string, string> $vars @return array<string, mixed> */
    private function db(array $vars): array
    {
        foreach ($vars as $name => $value) {
            putenv("$name=$value");
        }

        return (require __DIR__ . '/../config/settings.php')()['db'];
    }

    public function testMysqlNamesAreAcceptedForRailwayAndXampp(): void
    {
        $db = $this->db(['MYSQL_HOST' => 'db.example', 'MYSQL_PORT' => '3333', 'MYSQL_DATABASE' => 'shop', 'MYSQL_USER' => 'u', 'MYSQL_PASSWORD' => 'p']);

        self::assertSame(['db.example', 3333, 'shop', 'u', 'p'], [$db['host'], $db['port'], $db['name'], $db['user'], $db['pass']]);
    }

    public function testDbNamesWinWhenBothAreSet(): void
    {
        $db = $this->db(['DB_HOST' => 'a', 'MYSQL_HOST' => 'b', 'DB_NAME' => 'x', 'MYSQL_DATABASE' => 'y']);

        self::assertSame(['a', 'x'], [$db['host'], $db['name']]);
    }

    public function testLocalhostIsADefaultOnlyForLocalDevelopment(): void
    {
        self::assertSame('127.0.0.1', $this->db(['APP_ENV' => 'local'])['host']);
        self::assertSame('', $this->db(['APP_ENV' => 'production'])['host'], 'production never silently falls back to localhost');
    }

    public function testRailwaysConnectionUrlConfiguresEverythingIncludingAnEscapedPassword(): void
    {
        $db = $this->db(['APP_ENV' => 'production', 'MYSQL_URL' => 'mysql://root:p%40ss%2Fw%3Ard@mysql.railway.internal:3306/railway']);

        self::assertSame(['mysql.railway.internal', 3306, 'railway', 'root', 'p@ss/w:rd'], [$db['host'], $db['port'], $db['name'], $db['user'], $db['pass']]);
    }

    public function testIndividualVariablesStillWinOverTheUrl(): void
    {
        $db = $this->db(['MYSQL_URL' => 'mysql://u:p@url-host:3306/urldb', 'DB_HOST' => '127.0.0.1', 'DB_NAME' => 'localdb']);

        self::assertSame(['127.0.0.1', 'localdb', 'u'], [$db['host'], $db['name'], $db['user']], 'XAMPP values can override, the rest comes from the URL');
    }

    public function testAMalformedUrlConfiguresNothing(): void
    {
        foreach (['not a url', 'http://evil.example/db', 'mysql:///nohost', 'mysql://user@'] as $bad) {
            self::assertSame([], \App\Support\DatabaseUrl::parse($bad), $bad);
        }
        self::assertSame('', $this->db(['APP_ENV' => 'production', 'MYSQL_URL' => 'http://evil.example/db'])['host']);
    }
}
