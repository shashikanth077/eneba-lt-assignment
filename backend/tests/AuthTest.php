<?php

declare(strict_types=1);

namespace Tests;

use Firebase\JWT\JWT;
use Psr\Http\Message\ResponseInterface;

/** Integration tests: real app, real database (keymart_test), no mocks. Skipped when the DB is unreachable. */
final class AuthTest extends DbTestCase
{
    private const PASSWORD = 'correct horse 9';

    protected function setUp(): void
    {
        parent::setUp();
        // other test classes leave carts/orders behind that reference users, so clear those too (FK checks off, like the other fixtures)
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['stripe_events', 'cart_items', 'order_items', 'game_keys', 'orders', 'login_attempts', 'users'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    // ---- registration ----------------------------------------------------------------------

    public function testRegisterSucceedsAndSignsTheUserIn(): void
    {
        $response = $this->post('/api/auth/register', ['email' => 'Ana@Example.com', 'password' => self::PASSWORD, 'displayName' => 'Ana']);

        self::assertSame(201, $response->getStatusCode());
        $user = $this->json($response)['user'];
        self::assertSame('ana@example.com', $user['email'], 'email is normalised');
        self::assertSame('Ana', $user['displayName']);
        self::assertArrayNotHasKey('password_hash', $user);

        $cookie = $response->getHeaderLine('Set-Cookie');
        foreach (['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'] as $flag) {
            self::assertStringContainsString($flag, $cookie);
        }

        $hash = (string) self::$pdo->query('SELECT password_hash FROM users')->fetchColumn();
        self::assertStringStartsWith('$argon2id$', $hash);

        $me = $this->get('/api/auth/me', $this->tokenFrom($response));
        self::assertSame(200, $me->getStatusCode());
        self::assertSame('ana@example.com', $this->json($me)['user']['email']);
    }

    public function testRegisterRejectsDuplicateEmailCaseInsensitively(): void
    {
        $this->register('ana@example.com');
        $response = $this->post('/api/auth/register', ['email' => 'ANA@example.com', 'password' => self::PASSWORD, 'displayName' => 'Other']);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('email_taken', $this->json($response)['error']['code']);
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
    }

    public function testRegisterValidatesInput(): void
    {
        $response = $this->post('/api/auth/register', ['email' => 'not-an-email', 'password' => 'short', 'displayName' => '']);

        self::assertSame(422, $response->getStatusCode());
        $error = $this->json($response)['error'];
        self::assertSame('validation_failed', $error['code']);
        self::assertSame(['email', 'password', 'displayName'], array_keys($error['details']['fields']));
    }

    // ---- login -----------------------------------------------------------------------------

    public function testLoginSucceeds(): void
    {
        $this->register('ana@example.com');
        $response = $this->post('/api/auth/login', ['email' => 'Ana@Example.com', 'password' => self::PASSWORD]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('ana@example.com', $this->json($response)['user']['email']);
        self::assertStringContainsString('HttpOnly', $response->getHeaderLine('Set-Cookie'));
    }

    public function testWrongPasswordAndUnknownEmailLookIdentical(): void
    {
        $this->register('ana@example.com');

        $wrongPassword = $this->post('/api/auth/login', ['email' => 'ana@example.com', 'password' => 'wrong password 1']);
        $unknownEmail = $this->post('/api/auth/login', ['email' => 'ghost@example.com', 'password' => 'wrong password 1']);

        self::assertSame(401, $wrongPassword->getStatusCode());
        self::assertSame($wrongPassword->getStatusCode(), $unknownEmail->getStatusCode());
        self::assertSame((string) $wrongPassword->getBody(), (string) $unknownEmail->getBody(), 'bodies must be byte-identical');
        self::assertSame('invalid_credentials', $this->json($wrongPassword)['error']['code']);
        self::assertSame('', $wrongPassword->getHeaderLine('Set-Cookie'));
    }

    public function testLoginIsRateLimitedPerEmailAndIp(): void
    {
        $this->register('ana@example.com');
        for ($i = 0; $i < 5; $i++) {
            self::assertSame(401, $this->post('/api/auth/login', ['email' => 'ana@example.com', 'password' => 'wrong password 1'])->getStatusCode());
        }

        // Locked out: even the correct password is refused now.
        $locked = $this->post('/api/auth/login', ['email' => 'ana@example.com', 'password' => self::PASSWORD]);
        self::assertSame(429, $locked->getStatusCode());
        self::assertSame('too_many_attempts', $this->json($locked)['error']['code']);
        self::assertGreaterThan(0, $this->json($locked)['error']['details']['retryAfterSeconds']);
        self::assertSame((string) $this->json($locked)['error']['details']['retryAfterSeconds'], $locked->getHeaderLine('Retry-After'));

        // A different email from the same IP is not locked by the per-email counter.
        $this->register('bob@example.com', ip: '10.9.9.9');
        $other = $this->post('/api/auth/login', ['email' => 'bob@example.com', 'password' => self::PASSWORD]);
        self::assertSame(200, $other->getStatusCode());
    }

    public function testRateLimitAnswersTheSameForUnknownEmails(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->post('/api/auth/login', ['email' => 'ghost@example.com', 'password' => 'wrong password 1']);
        }
        $response = $this->post('/api/auth/login', ['email' => 'ghost@example.com', 'password' => 'wrong password 1']);

        self::assertSame(429, $response->getStatusCode(), 'unknown emails are throttled exactly like real ones');
    }

    // ---- sessions --------------------------------------------------------------------------

    public function testExpiredTokenIsRejected(): void
    {
        $id = $this->userId($this->register('ana@example.com'));
        $expired = $this->forgeToken(['sub' => (string) $id, 'tv' => 0, 'iat' => time() - 7200, 'exp' => time() - 3600]);

        $response = $this->get('/api/auth/me', $expired);

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('token_expired', $this->json($response)['error']['code']);
    }

    public function testTokenSignedWithAnotherSecretIsRejected(): void
    {
        $id = $this->userId($this->register('ana@example.com'));
        $forged = JWT::encode(['sub' => (string) $id, 'tv' => 0, 'iat' => time(), 'exp' => time() + 3600], str_repeat('z', 40), 'HS256');

        $response = $this->get('/api/auth/me', $forged);

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('invalid_token', $this->json($response)['error']['code']);
    }

    public function testMeRequiresACookie(): void
    {
        $response = $this->get('/api/auth/me');

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('unauthorized', $this->json($response)['error']['code']);
    }

    public function testLogoutClearsTheCookieAndRevokesTheToken(): void
    {
        $token = $this->tokenFrom($this->register('ana@example.com'));
        self::assertSame(200, $this->get('/api/auth/me', $token)->getStatusCode());

        $logout = $this->post('/api/auth/logout', [], $token);

        self::assertSame(204, $logout->getStatusCode());
        self::assertStringContainsString('Max-Age=0', $logout->getHeaderLine('Set-Cookie'));
        self::assertSame(401, $this->get('/api/auth/me', $token)->getStatusCode(), 'the old JWT is dead server-side');
    }

    // ---- CSRF ------------------------------------------------------------------------------

    public function testStateChangingRequestsNeedTheCustomHeaderAndAKnownOrigin(): void
    {
        $body = ['email' => 'ana@example.com', 'password' => self::PASSWORD];

        $noHeader = $this->send('POST', '/api/auth/login', $body, headers: ['X-Requested-With' => '']);
        $badOrigin = $this->post('/api/auth/login', $body, headers: ['Origin' => 'https://evil.example']);
        $goodOrigin = $this->post('/api/auth/login', $body, headers: ['Origin' => 'http://localhost:5173']);

        self::assertSame(403, $noHeader->getStatusCode());
        self::assertSame('csrf_rejected', $this->json($noHeader)['error']['code']);
        self::assertSame(403, $badOrigin->getStatusCode());
        self::assertSame(401, $goodOrigin->getStatusCode(), 'allowed origin passes CSRF and reaches the login check');
    }

    // ---- helpers ---------------------------------------------------------------------------

    private function register(string $email, string $ip = '10.0.0.1'): ResponseInterface
    {
        $response = $this->post('/api/auth/register', ['email' => $email, 'password' => self::PASSWORD, 'displayName' => 'Test User'], ip: $ip);
        self::assertSame(201, $response->getStatusCode());

        return $response;
    }

    private function userId(ResponseInterface $registerResponse): int
    {
        return $this->json($registerResponse)['user']['id'];
    }

    private function tokenFrom(ResponseInterface $response): string
    {
        self::assertSame(1, preg_match('/^session=([^;]+);/', $response->getHeaderLine('Set-Cookie'), $m));

        return $m[1];
    }

    /** @param array<string, mixed> $claims */
    private function forgeToken(array $claims): string
    {
        return JWT::encode($claims, (string) $_ENV['JWT_SECRET'], 'HS256');
    }

    /** @param array<string, mixed> $body @param array<string, string> $headers */
    private function post(string $path, array $body, ?string $token = null, string $ip = '10.0.0.1', array $headers = []): ResponseInterface
    {
        return $this->send('POST', $path, $body, $token, $ip, $headers);
    }

    private function get(string $path, ?string $token = null): ResponseInterface
    {
        return $this->send('GET', $path, null, $token);
    }
}
