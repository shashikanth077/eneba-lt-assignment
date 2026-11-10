<?php

declare(strict_types=1);

namespace Tests;

use App\Support\KeyCipher;
use Database\Seeds\DatabaseSeeder;
use Psr\Http\Message\ResponseInterface;

/** Edit profile, change password, and the demo accounts that must stay usable for the next reviewer. */
final class AccountTest extends DbTestCase
{
    private const PASSWORD = 'correct horse 9';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['stripe_events', 'cart_items', 'order_items', 'game_keys', 'orders', 'login_attempts', 'rate_limits', 'email_verifications', 'users'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function testEditProfileChangesTheDisplayNameAndNothingElse(): void
    {
        $session = $this->cookie($this->register('ana@example.com'));

        $response = $this->send('PATCH', '/api/auth/profile', ['displayName' => '  Ana Maria '], $session);

        self::assertSame(200, $response->getStatusCode());
        $user = $this->json($response)['user'];
        self::assertSame('Ana Maria', $user['displayName']);
        self::assertSame('ana@example.com', $user['email'], 'the e-mail is the verified login and is not editable');
        self::assertSame('Ana Maria', $this->json($this->send('GET', '/api/auth/me', null, $session))['user']['displayName']);
    }

    public function testProfileValidationAndAuthentication(): void
    {
        $session = $this->cookie($this->register('ana@example.com'));

        self::assertSame(422, $this->send('PATCH', '/api/auth/profile', ['displayName' => 'A'], $session)->getStatusCode());
        self::assertSame(422, $this->send('PATCH', '/api/auth/profile', [], $session)->getStatusCode());
        self::assertSame(401, $this->send('PATCH', '/api/auth/profile', ['displayName' => 'Anna'])->getStatusCode());
    }

    public function testChangePasswordNeedsTheCurrentOneRevokesOtherSessionsAndKeepsThisOne(): void
    {
        $register = $this->register('ana@example.com');
        $thisDevice = $this->cookie($register);
        $otherDevice = $this->cookie($this->send('POST', '/api/auth/login', ['email' => 'ana@example.com', 'password' => self::PASSWORD]));

        $wrong = $this->send('POST', '/api/auth/change-password', ['currentPassword' => 'not the password', 'newPassword' => 'a brand new one 1'], $thisDevice);
        self::assertSame(422, $wrong->getStatusCode());
        self::assertArrayHasKey('currentPassword', $this->json($wrong)['error']['details']['fields']);

        $same = $this->send('POST', '/api/auth/change-password', ['currentPassword' => self::PASSWORD, 'newPassword' => self::PASSWORD], $thisDevice);
        self::assertSame(422, $same->getStatusCode());

        $ok = $this->send('POST', '/api/auth/change-password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'a brand new one 1'], $thisDevice);
        self::assertSame(200, $ok->getStatusCode());
        $fresh = $this->cookie($ok);

        self::assertSame(200, $this->send('GET', '/api/auth/me', null, $fresh)->getStatusCode(), 'this device stays signed in');
        self::assertSame(401, $this->send('GET', '/api/auth/me', null, $otherDevice)->getStatusCode(), 'every other session was revoked');
        self::assertSame(401, $this->send('POST', '/api/auth/login', ['email' => 'ana@example.com', 'password' => self::PASSWORD])->getStatusCode());
        self::assertSame(200, $this->send('POST', '/api/auth/login', ['email' => 'ana@example.com', 'password' => 'a brand new one 1'])->getStatusCode());
    }

    public function testNewPasswordMustBeLongEnough(): void
    {
        $session = $this->cookie($this->register('ana@example.com'));

        $response = $this->send('POST', '/api/auth/change-password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'short'], $session);

        self::assertSame(422, $response->getStatusCode());
        self::assertArrayHasKey('newPassword', $this->json($response)['error']['details']['fields']);
    }

    public function testDemoAccountsHaveHistoryAndKeepTheirPassword(): void
    {
        (new DatabaseSeeder(self::$pdo, KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY'])))->run();
        $login = $this->send('POST', '/api/auth/login', ['email' => 'demo.buyer@keymart.test', 'password' => 'Demo-Buyer-2027']);
        self::assertSame(200, $login->getStatusCode());
        $session = $this->cookie($login);

        $orders = $this->json($this->send('GET', '/api/orders', null, $session));
        self::assertSame(2, $orders['total'], 'realistic history: two paid orders');

        $detail = $this->json($this->send('GET', '/api/orders/' . $orders['items'][0]['id'], null, $session))['order'];
        self::assertSame('paid', $detail['status']);
        self::assertNotEmpty($detail['items'][0]['keys'], 'the owner sees the delivered keys');

        $blocked = $this->send('POST', '/api/auth/change-password', ['currentPassword' => 'Demo-Buyer-2027', 'newPassword' => 'Vandalised-1234'], $session);
        self::assertSame(403, $blocked->getStatusCode());
        self::assertSame('demo_account', $this->json($blocked)['error']['code']);
        self::assertSame(200, $this->send('POST', '/api/auth/login', ['email' => 'demo.buyer@keymart.test', 'password' => 'Demo-Buyer-2027'])->getStatusCode());
    }

    private function register(string $email): ResponseInterface
    {
        $response = $this->send('POST', '/api/auth/register', ['email' => $email, 'password' => self::PASSWORD, 'displayName' => 'Test User']);
        self::assertSame(201, $response->getStatusCode());

        return $response;
    }

    private function cookie(ResponseInterface $response): string
    {
        self::assertSame(1, preg_match('/^session=([^;]+);/', $response->getHeaderLine('Set-Cookie'), $m));

        return $m[1];
    }
}
