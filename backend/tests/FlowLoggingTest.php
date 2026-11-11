<?php

declare(strict_types=1);

namespace Tests;

use App\Mail\NullVerificationMailer;
use App\Support\Log;

/** What an operator reading the deployment's log can learn about each flow. Every line is parsed back, so the format is tested too. */
final class FlowLoggingTest extends ShopTestCase
{
    /** @var list<array<string, mixed>> */
    private array $lines = [];

    protected function setUp(): void
    {
        parent::setUp();
        $_ENV['LOG_LEVEL'] = 'debug';
        $this->lines = [];
        Log::setSink(function (string $line): void {
            $this->lines[] = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
        });
    }

    protected function tearDown(): void
    {
        Log::setSink(null);
        $_ENV['LOG_LEVEL'] = 'off';
        Log::configure('off');
        parent::tearDown();
    }

    /** @return list<array<string, mixed>> */
    private function events(string $event): array
    {
        return array_values(array_filter($this->lines, static fn (array $l): bool => $l['event'] === $event));
    }

    public function testEveryRequestGetsOneLineAndAnIdThatIsAlsoOnTheResponse(): void
    {
        $response = $this->send('GET', '/api/health', headers: ['X-Request-Id' => 'trace-me-12345']);

        self::assertSame('trace-me-12345', $response->getHeaderLine('X-Request-Id'));
        $line = $this->events('http.request')[0];
        self::assertSame(['GET', '/api/health', 200, 'trace-me-12345'], [$line['method'], $line['path'], $line['status'], $line['request_id']]);
        self::assertSame('debug', $line['level'], 'the health check is only logged at debug level');

        $generated = $this->send('GET', '/api/products')->getHeaderLine('X-Request-Id');
        self::assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $generated);
        $send = $this->send('GET', '/api/products', headers: ['X-Request-Id' => 'bad id with spaces'])->getHeaderLine('X-Request-Id');
        self::assertNotSame('bad id with spaces', $send, 'an unsafe caller id is replaced');
    }

    public function testRequestLinesAreWarnFor4xxAndErrorFor5xx(): void
    {
        $this->send('GET', '/api/cart'); // not signed in -> 401

        self::assertSame('warn', $this->events('http.request')[0]['level']);
    }

    public function testASignedInRequestCarriesTheUserIdOnItsLines(): void
    {
        $buyer = $this->user('a@example.com');

        $this->call('GET', '/api/cart', $buyer['token']);

        self::assertSame($buyer['id'], $this->events('http.request')[0]['user_id']);
    }

    public function testAFailedLoginIsAWarningWithAMaskedAddressAndNeverThePassword(): void
    {
        $this->send('POST', '/api/auth/login', ['email' => 'ghost@example.com', 'password' => 'super secret pw 1']);

        $line = $this->events('auth.login.failed')[0];
        self::assertSame(['warn', 'invalid_credentials', 'g***@example.com'], [$line['level'], $line['reason'], $line['email']]);
        self::assertStringNotContainsString('super secret pw 1', json_encode($this->lines, JSON_THROW_ON_ERROR));
        self::assertStringNotContainsString('ghost@example.com', json_encode($this->lines, JSON_THROW_ON_ERROR));
    }

    public function testRegistrationLogsTheOutcomeAndSaysWhyNoVerificationE_mailWasSent(): void
    {
        $this->containerOverrides[\App\Mail\VerificationMailer::class] = new NullVerificationMailer(['EMAILJS_SERVICE_ID', 'EMAILJS_PRIVATE_KEY']);

        $this->send('POST', '/api/auth/register', ['email' => 'new@example.com', 'password' => 'correct horse 9', 'displayName' => 'New']);

        self::assertSame('info', $this->events('auth.register.ok')[0]['level']);
        $skipped = $this->events('mail.verification.skipped')[0];
        self::assertSame('warn', $skipped['level']);
        self::assertSame('EMAILJS_SERVICE_ID,EMAILJS_PRIVATE_KEY', $skipped['missing_settings'], 'the log names the settings to fix');
        self::assertSame('n***@example.com', $skipped['to']);
    }

    public function testCheckoutIsFollowedFromReservationToTheStripeIntentAndPaymentToPaid(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 2);
        $order = $this->checkout($buyer['token']);
        $this->pay($order['orderId']);

        $names = array_column($this->lines, 'event');
        foreach (['cart.line.set', 'checkout.started', 'checkout.reserved', 'checkout.intent', 'webhook.received', 'payment.paid', 'webhook.handled'] as $event) {
            self::assertContains($event, $names, $event);
        }
        self::assertLessThan(array_search('checkout.intent', $names, true), array_search('checkout.reserved', $names, true), 'in flow order');
        self::assertLessThan(array_search('payment.paid', $names, true), array_search('checkout.intent', $names, true));
        self::assertSame($order['orderId'], $this->events('payment.paid')[0]['order_id']);
        self::assertStringNotContainsString('_secret_', json_encode($this->lines, JSON_THROW_ON_ERROR), 'the payment client secret is never logged');
    }

    public function testRefusedCheckoutAndStockProblemsAreWarningsThatNameTheOffer(): void
    {
        $buyer = $this->user('a@example.com');
        $this->call('POST', '/api/cart', $buyer['token'], ['offerId' => 1, 'qty' => 99]); // above the 5 allowed -> 422, above stock below
        $this->call('POST', '/api/checkout', $buyer['token']); // empty cart

        $refused = $this->events('checkout.refused')[0];
        self::assertSame(['warn', 'cart_empty'], [$refused['level'], $refused['reason']]);
    }

    public function testAWebhookWithABadSignatureIsAWarningAndAMissingSecretAnError(): void
    {
        $this->webhook($this->event('evt_x', 'payment_intent.succeeded', 'pi_x', 100), 't=1,v1=bad');

        $line = $this->events('webhook.rejected')[0];
        self::assertSame(['warn', 'invalid_signature'], [$line['level'], $line['reason']]);
    }

    public function testWithoutAStripeKeyCheckoutSaysWhichSettingIsMissing(): void
    {
        $this->containerOverrides = []; // the real container: STRIPE_SECRET_KEY is empty in the test environment
        $buyer = $this->user('a@example.com');
        $this->call('POST', '/api/cart', $buyer['token'], ['offerId' => 1, 'qty' => 1]);

        $this->call('POST', '/api/checkout', $buyer['token']);

        $line = $this->events('checkout.payments.unconfigured')[0];
        self::assertSame(['error', 'STRIPE_SECRET_KEY'], [$line['level'], $line['setting']]);
    }

    public function testThePaymentSyncExplainsAFailureToReachStripe(): void
    {
        $buyer = $this->user('a@example.com');
        $this->addToCart($buyer['token'], 1, 1);
        $order = $this->checkout($buyer['token']);
        $this->gateway->failRetrieve = true;

        $this->call('GET', '/api/orders/' . $order['orderId'], $buyer['token']);

        $line = $this->events('payment.sync.failed')[0];
        self::assertSame('error', $line['level']);
        self::assertStringContainsString('STRIPE_SECRET_KEY', $line['msg']);
    }

    public function testTheBrowserCanReportOnlyKnownEventsAtTheLevelTheServerChooses(): void
    {
        $ok = $this->send('POST', '/api/client-log', ['event' => 'email.failed', 'fields' => ['kind' => 'order', 'reason' => 'EmailJS 412', 'email' => 'leak@example.com', 'password' => 'x', 'level' => 'debug']]);
        $unknown = $this->send('POST', '/api/client-log', ['event' => 'drop.table', 'fields' => []]);

        self::assertSame(204, $ok->getStatusCode());
        self::assertSame(422, $unknown->getStatusCode());
        $line = $this->events('browser.email.failed')[0];
        self::assertSame(['error', 'browser', 'order', 'EmailJS 412'], [$line['level'], $line['source'], $line['kind'], $line['reason']]);
        self::assertArrayNotHasKey('email', $line, 'fields that are not on the list are dropped');
        self::assertStringNotContainsString('leak@example.com', json_encode($this->lines, JSON_THROW_ON_ERROR));
    }

    public function testAnUnhandledExceptionIsAnErrorWithTheRequestId(): void
    {
        $_ENV['DB_PORT'] = '1'; // nothing listens there: the next request cannot reach the database
        try {
            $this->send('GET', '/api/health', headers: ['X-Request-Id' => 'db-down-12345']);
        } finally {
            unset($_ENV['DB_PORT']);
        }

        $line = $this->events('db.unreachable')[0];
        self::assertSame(['error', 'db-down-12345'], [$line['level'], $line['request_id']]);
    }
}
