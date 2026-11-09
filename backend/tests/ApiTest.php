<?php

declare(strict_types=1);

namespace Tests;

use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

final class ApiTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $savedEnv = [];

    protected function setUp(): void
    {
        // Point the DB at a closed port so the "database down" path is deterministic.
        foreach (['DB_HOST' => '127.0.0.1', 'DB_PORT' => '1', 'CORS_ALLOWED_ORIGINS' => 'http://localhost:5173'] as $k => $v) {
            $this->savedEnv[$k] = $_ENV[$k] ?? null;
            $_ENV[$k] = $v;
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->savedEnv as $k => $v) {
            if ($v === null) {
                unset($_ENV[$k]);
            } else {
                $_ENV[$k] = $v;
            }
        }
    }

    /** @param array<string, string> $headers */
    private function call(string $method, string $path, array $headers = []): ResponseInterface
    {
        $app = (require __DIR__ . '/../src/bootstrap.php')();
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** @return array<string, mixed> */
    private function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testUnknownRouteUsesErrorFormat(): void
    {
        $response = $this->call('GET', '/api/nope');

        self::assertSame(404, $response->getStatusCode());
        self::assertSame(['error' => ['code' => 'not_found', 'message' => 'Resource not found', 'details' => null]], $this->json($response));
    }

    public function testWrongMethodUsesErrorFormat(): void
    {
        $response = $this->call('POST', '/api/health', ['X-Requested-With' => 'fetch']);

        self::assertSame(405, $response->getStatusCode());
        self::assertSame('method_not_allowed', $this->json($response)['error']['code']);
    }

    public function testHealthReportsDatabaseDownInErrorFormat(): void
    {
        $response = $this->call('GET', '/api/health');

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('db_unavailable', $this->json($response)['error']['code']);
        self::assertArrayHasKey('details', $this->json($response)['error']);
    }

    public function testPreflightAllowsListedOriginOnly(): void
    {
        $ok = $this->call('OPTIONS', '/api/health', ['Origin' => 'http://localhost:5173', 'Access-Control-Request-Method' => 'POST']);
        $bad = $this->call('OPTIONS', '/api/health', ['Origin' => 'http://evil.test', 'Access-Control-Request-Method' => 'POST']);

        self::assertSame(204, $ok->getStatusCode());
        self::assertSame('http://localhost:5173', $ok->getHeaderLine('Access-Control-Allow-Origin'));
        self::assertSame('', $bad->getHeaderLine('Access-Control-Allow-Origin'));
    }

    public function testErrorResponsesAlsoCarryCorsHeaders(): void
    {
        $response = $this->call('GET', '/api/nope', ['Origin' => 'http://localhost:5173']);

        self::assertSame('http://localhost:5173', $response->getHeaderLine('Access-Control-Allow-Origin'));
    }
}
