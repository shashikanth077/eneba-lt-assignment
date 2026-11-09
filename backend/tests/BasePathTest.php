<?php

declare(strict_types=1);

namespace Tests;

/** XAMPP serves the API from a subfolder (http://localhost/keymart/backend/public/api/...). APP_BASE_PATH makes the routes follow. */
final class BasePathTest extends DbTestCase
{
    private const BASE = '/keymart/backend/public';

    protected function tearDown(): void
    {
        unset($_ENV['APP_BASE_PATH']);
        parent::tearDown();
    }

    public function testRoutesAnswerUnderTheSubfolderWhenABasePathIsConfigured(): void
    {
        $_ENV['APP_BASE_PATH'] = self::BASE . '/'; // a trailing slash is forgiven

        self::assertSame(200, $this->send('GET', self::BASE . '/api/health')->getStatusCode());
        self::assertSame(404, $this->send('GET', '/api/health')->getStatusCode(), 'the root path is not the API any more');
    }

    public function testWithoutABasePathNothingChanges(): void
    {
        self::assertSame(200, $this->send('GET', '/api/health')->getStatusCode());
    }

    public function testTheStripeWebhookStaysCsrfExemptUnderTheSubfolder(): void
    {
        $_ENV['APP_BASE_PATH'] = self::BASE;
        // Stripe sends no browser headers. A wrong signature is a 400 from the webhook itself; a CSRF rejection would be 403.
        $response = $this->sendRaw('POST', self::BASE . '/api/webhooks/stripe', '{}', ['Stripe-Signature' => 't=1,v1=bad']);

        self::assertNotSame(403, $response->getStatusCode(), 'CSRF middleware must not block the webhook');
        self::assertSame(400, $response->getStatusCode());
    }
}
