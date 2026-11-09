<?php

declare(strict_types=1);

namespace Tests;

use App\Support\Database;
use App\Support\Migrator;
use Dotenv\Dotenv;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

/** Base class for integration tests: real app + real database (keymart_test). Skipped when the DB is unreachable. */
abstract class DbTestCase extends TestCase
{
    protected static PDO $pdo;
    private static ?string $skipReason = null;

    public static function setUpBeforeClass(): void
    {
        Dotenv::createImmutable(dirname(__DIR__))->safeLoad(); // so a single test class also finds the DB credentials
        $_ENV['DB_NAME'] = getenv('TEST_DB_NAME') ?: 'keymart_test';
        self::$skipReason = null;
        try {
            $settings = (require __DIR__ . '/../config/settings.php')();
            self::$pdo = Database::connect($settings['db']);
            (new Migrator(self::$pdo, __DIR__ . '/../database/migrations'))->run();
        } catch (\Throwable $e) {
            self::$skipReason = 'Test database not reachable: ' . $e->getMessage();
        }
    }

    protected function setUp(): void
    {
        if (self::$skipReason !== null) {
            self::markTestSkipped(self::$skipReason);
        }
        $_ENV['DB_NAME'] = getenv('TEST_DB_NAME') ?: 'keymart_test';
    }

    /** @param array<string, mixed>|null $body @param array<string, string> $headers */
    protected function send(string $method, string $path, ?array $body = null, ?string $token = null, string $ip = '10.0.0.1', array $headers = []): ResponseInterface
    {
        $app = (require __DIR__ . '/../src/bootstrap.php')();
        $request = (new ServerRequestFactory())->createServerRequest($method, $path, ['REMOTE_ADDR' => $ip])
            ->withHeader('X-Requested-With', 'fetch');
        if ($body !== null) {
            $request = $request->withHeader('Content-Type', 'application/json')
                ->withBody((new StreamFactory())->createStream(json_encode($body, JSON_THROW_ON_ERROR)));
        }
        if ($token !== null) {
            $request = $request->withCookieParams(['session' => $token]);
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** @return array<string, mixed> */
    protected function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
