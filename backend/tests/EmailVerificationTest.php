<?php

declare(strict_types=1);

namespace Tests;

use App\Mail\VerificationMailer;
use App\Support\KeyCipher;
use Database\Seeds\DatabaseSeeder;
use Psr\Http\Message\ResponseInterface;

/** Records what would have been e-mailed. */
final class RecordingMailer implements VerificationMailer
{
    /** @var list<array{email: string, name: string, url: string, expires: string}> */
    public array $sent = [];

    public function sendVerification(string $toEmail, string $toName, string $verifyUrl, string $expiresIn): bool
    {
        $this->sent[] = ['email' => $toEmail, 'name' => $toName, 'url' => $verifyUrl, 'expires' => $expiresIn];

        return true;
    }
}

final class EmailVerificationTest extends DbTestCase
{
    private RecordingMailer $mailer;

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['stripe_events', 'cart_items', 'order_items', 'game_keys', 'orders', 'login_attempts', 'rate_limits', 'email_verifications', 'users'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        $this->mailer = new RecordingMailer();
        $this->containerOverrides = [VerificationMailer::class => $this->mailer];
    }

    public function testRegisteringSendsOneLinkAndTheAccountStartsUnverified(): void
    {
        $user = $this->json($this->register('ana@example.com'))['user'];

        self::assertFalse($user['emailVerified']);
        self::assertCount(1, $this->mailer->sent);
        self::assertSame('ana@example.com', $this->mailer->sent[0]['email']);
        self::assertSame('24 hours', $this->mailer->sent[0]['expires']);
        self::assertMatchesRegularExpression('#^http://localhost:5173/verify-email\?token=[0-9a-f]{64}$#', $this->mailer->sent[0]['url']);
    }

    public function testOnlyAHashOfTheTokenIsStored(): void
    {
        $this->register('ana@example.com');
        $token = $this->tokenFromLastMail();

        $stored = (string) self::$pdo->query('SELECT token_hash FROM email_verifications')->fetchColumn();
        self::assertSame(hash('sha256', $token), $stored);
        self::assertNotSame($token, $stored);
    }

    public function testTheLinkVerifiesTheAccountOnceAndNeedsNoSession(): void
    {
        $this->register('ana@example.com');
        $token = $this->tokenFromLastMail();

        $first = $this->send('POST', '/api/auth/verify-email', ['token' => $token]); // no cookie: opened in another browser
        self::assertSame(200, $first->getStatusCode());
        self::assertNotNull(self::$pdo->query('SELECT email_verified_at FROM users')->fetchColumn());

        $second = $this->send('POST', '/api/auth/verify-email', ['token' => $token]);
        self::assertSame(400, $second->getStatusCode(), 'a link works once');
    }

    public function testAnExpiredLinkIsRefusedAndLeavesTheAccountUnverified(): void
    {
        $this->register('ana@example.com');
        $token = $this->tokenFromLastMail();
        self::$pdo->exec('UPDATE email_verifications SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE)');

        $response = $this->send('POST', '/api/auth/verify-email', ['token' => $token]);

        self::assertSame(400, $response->getStatusCode());
        self::assertNull(self::$pdo->query('SELECT email_verified_at FROM users')->fetchColumn());
    }

    public function testUnknownExpiredAndUsedTokensGetTheSameAnswer(): void
    {
        $this->register('ana@example.com');
        $unknown = $this->send('POST', '/api/auth/verify-email', ['token' => str_repeat('a', 64)]);
        self::$pdo->exec('UPDATE email_verifications SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE)');
        $expired = $this->send('POST', '/api/auth/verify-email', ['token' => $this->tokenFromLastMail()]);

        self::assertSame((string) $unknown->getBody(), (string) $expired->getBody());
    }

    public function testAMalformedTokenIsA422(): void
    {
        self::assertSame(422, $this->send('POST', '/api/auth/verify-email', ['token' => 'short'])->getStatusCode());
        self::assertSame(422, $this->send('POST', '/api/auth/verify-email', [])->getStatusCode());
    }

    public function testResendNeedsASessionAndReplacesTheOldLink(): void
    {
        $registered = $this->register('ana@example.com');
        $old = $this->tokenFromLastMail();
        self::assertSame(401, $this->send('POST', '/api/auth/resend-verification', [])->getStatusCode());

        $response = $this->send('POST', '/api/auth/resend-verification', [], $this->cookie($registered));
        self::assertSame(202, $response->getStatusCode());
        self::assertCount(2, $this->mailer->sent);

        self::assertSame(400, $this->send('POST', '/api/auth/verify-email', ['token' => $old])->getStatusCode(), 'the old link stopped working');
        self::assertSame(200, $this->send('POST', '/api/auth/verify-email', ['token' => $this->tokenFromLastMail()])->getStatusCode());
    }

    public function testAVerifiedAccountCannotAskAgain(): void
    {
        $registered = $this->register('ana@example.com');
        $this->send('POST', '/api/auth/verify-email', ['token' => $this->tokenFromLastMail()]);

        $response = $this->send('POST', '/api/auth/resend-verification', [], $this->cookie($registered));

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('already_verified', $this->json($response)['error']['code']);
        self::assertTrue($this->json($this->send('GET', '/api/auth/me', null, $this->cookie($registered)))['user']['emailVerified']);
    }

    public function testResendIsLimitedPerAccount(): void
    {
        $_ENV['RATE_LIMIT_RESEND_VERIFICATION_PER_HOUR'] = '2';
        try {
            $registered = $this->register('ana@example.com');
            $statuses = [];
            for ($i = 0; $i < 3; $i++) {
                $statuses[] = $this->send('POST', '/api/auth/resend-verification', [], $this->cookie($registered))->getStatusCode();
            }
        } finally {
            unset($_ENV['RATE_LIMIT_RESEND_VERIFICATION_PER_HOUR']);
        }

        self::assertSame([202, 202, 429], $statuses);
    }

    public function testTheSeededDemoAccountsAreVerifiedCanSignInAndSeedingTwiceChangesNothing(): void
    {
        $seeder = new DatabaseSeeder(self::$pdo, KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY']));
        $seeder->run();
        $seeder->run();

        self::assertSame(2, (int) self::$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
        foreach (DatabaseSeeder::DEMO_USERS as [$email, , $password]) {
            $response = $this->send('POST', '/api/auth/login', ['email' => $email, 'password' => $password]);
            self::assertSame(200, $response->getStatusCode(), $email);
            self::assertTrue($this->json($response)['user']['emailVerified']);
        }
    }

    private function register(string $email): ResponseInterface
    {
        $response = $this->send('POST', '/api/auth/register', ['email' => $email, 'password' => 'correct horse 9', 'displayName' => 'Test User']);
        self::assertSame(201, $response->getStatusCode());

        return $response;
    }

    private function tokenFromLastMail(): string
    {
        self::assertNotEmpty($this->mailer->sent);
        self::assertSame(1, preg_match('/token=([0-9a-f]{64})$/', end($this->mailer->sent)['url'], $m));

        return $m[1];
    }

    private function cookie(ResponseInterface $response): string
    {
        self::assertSame(1, preg_match('/^session=([^;]+);/', $response->getHeaderLine('Set-Cookie'), $m));

        return $m[1];
    }
}
