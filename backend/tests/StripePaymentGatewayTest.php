<?php

declare(strict_types=1);

namespace Tests;

use App\Payment\PaymentGatewayException;
use App\Payment\StripePaymentGateway;
use PHPUnit\Framework\TestCase;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;

/**
 * The REAL StripePaymentGateway and the REAL Stripe SDK, with only the HTTP transport replaced. It proves what we send to
 * Stripe (amount, currency, metadata, idempotency key, auth) and how we read the answers. It does not prove that Stripe
 * accepts the call: that needs a real test key (see README, "Paying with Stripe test mode").
 */
final class StripePaymentGatewayTest extends TestCase implements ClientInterface
{
    /** @var list<array{method: string, url: string, headers: array<string, string>, params: mixed}> */
    private array $requests = [];
    /** @var list<array{string, int}> queued [body, status] answers */
    private array $answers = [];
    private mixed $previousClient;

    protected function setUp(): void
    {
        $this->previousClient = ApiRequestor::httpClient();
        ApiRequestor::setHttpClient($this);
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient($this->previousClient);
    }

    /** The SDK's transport interface: record the call, return the next queued answer. */
    public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
    {
        $parsed = [];
        foreach ($headers as $line) {
            [$name, $value] = array_pad(explode(':', (string) $line, 2), 2, '');
            $parsed[strtolower(trim($name))] = trim($value);
        }
        $this->requests[] = ['method' => strtolower($method), 'url' => $absUrl, 'headers' => $parsed, 'params' => $params];
        [$body, $status] = array_shift($this->answers) ?? ['{}', 200];

        return [$body, $status, []];
    }

    private function answer(array $body, int $status = 200): void
    {
        $this->answers[] = [json_encode($body, JSON_THROW_ON_ERROR), $status];
    }

    public function testCreatingAnIntentSendsTheServersAmountCurrencyOrderIdAndAnIdempotencyKey(): void
    {
        $this->answer(['id' => 'pi_123', 'object' => 'payment_intent', 'client_secret' => 'pi_123_secret_abc', 'status' => 'requires_payment_method']);

        $intent = (new StripePaymentGateway('sk_test_unit'))->createIntent(4500, 'EUR', 42, 'order-42');

        self::assertSame(['id' => 'pi_123', 'clientSecret' => 'pi_123_secret_abc'], $intent);
        self::assertCount(1, $this->requests);
        $request = $this->requests[0];
        self::assertSame('post', $request['method']);
        self::assertSame('https://api.stripe.com/v1/payment_intents', $request['url']);
        self::assertSame('Bearer sk_test_unit', $request['headers']['authorization']);
        self::assertSame('order-42', $request['headers']['idempotency-key']);
        $params = $request['params'];
        self::assertSame(4500, (int) $params['amount']);
        self::assertSame('eur', $params['currency'], 'lower-cased for Stripe');
        self::assertSame('42', (string) $params['metadata']['order_id']);
        self::assertTrue(filter_var($params['automatic_payment_methods']['enabled'], FILTER_VALIDATE_BOOLEAN));
        self::assertSame(['amount', 'currency', 'automatic_payment_methods', 'metadata'], array_keys($params), 'nothing else is sent');
    }

    public function testCancelAndRefundCallTheRightEndpoints(): void
    {
        $this->answer(['id' => 'pi_123', 'object' => 'payment_intent', 'status' => 'canceled']);
        $this->answer(['id' => 're_1', 'object' => 'refund', 'status' => 'succeeded']);
        $gateway = new StripePaymentGateway('sk_test_unit');

        $gateway->cancelIntent('pi_123');
        $gateway->refund('pi_123');

        self::assertSame('https://api.stripe.com/v1/payment_intents/pi_123/cancel', $this->requests[0]['url']);
        self::assertSame('post', $this->requests[0]['method']);
        self::assertSame('https://api.stripe.com/v1/refunds', $this->requests[1]['url']);
        self::assertSame('pi_123', $this->requests[1]['params']['payment_intent']);
        self::assertSame('refund-pi_123', $this->requests[1]['headers']['idempotency-key'], 'refunding twice cannot refund twice');
    }

    public function testAStripeErrorBecomesAGatewayException(): void
    {
        $this->answer(['error' => ['type' => 'invalid_request_error', 'message' => 'Invalid API Key provided: sk_test_***']], 401);

        $this->expectException(PaymentGatewayException::class);
        $this->expectExceptionMessage('Invalid API Key');
        (new StripePaymentGateway('sk_test_wrong'))->createIntent(1000, 'eur', 1, 'order-1');
    }

    public function testACardErrorOnCancelOrRefundBecomesAGatewayException(): void
    {
        $gateway = new StripePaymentGateway('sk_test_unit');

        $this->answer(['error' => ['type' => 'invalid_request_error', 'message' => 'This PaymentIntent cannot be canceled because it has a status of succeeded.']], 400);
        try {
            $gateway->cancelIntent('pi_done');
            self::fail('expected an exception');
        } catch (PaymentGatewayException $e) {
            self::assertStringContainsString('cannot be canceled', $e->getMessage());
        }

        $this->answer(['error' => ['type' => 'invalid_request_error', 'message' => 'Charge has already been refunded.']], 400);
        $this->expectException(PaymentGatewayException::class);
        $gateway->refund('pi_done');
    }

    public function testAnAnswerWithoutAClientSecretIsRefused(): void
    {
        $this->answer(['id' => 'pi_123', 'object' => 'payment_intent', 'status' => 'requires_payment_method']);

        $this->expectException(PaymentGatewayException::class);
        (new StripePaymentGateway('sk_test_unit'))->createIntent(1000, 'eur', 1, 'order-1');
    }
}
