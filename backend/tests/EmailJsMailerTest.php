<?php

declare(strict_types=1);

namespace Tests;

use App\Mail\EmailJsVerificationMailer;
use PHPUnit\Framework\TestCase;

final class EmailJsMailerTest extends TestCase
{
    private const MAIL = [
        'service_id' => 'service_x', 'auth_template_id' => 'template_auth', 'public_key' => 'pub_key',
        'private_key' => 'secret_private', 'company_name' => 'KEYMART', 'support_email' => 'help@example.com',
    ];

    public function testPostsTheRegisteredAddressToTheAuthTemplate(): void
    {
        $bodies = [];
        $mailer = new EmailJsVerificationMailer(self::MAIL, function (string $body) use (&$bodies): array {
            $bodies[] = json_decode($body, true, 512, JSON_THROW_ON_ERROR);

            return [200, 'OK'];
        });

        $this->assertTrue($mailer->sendVerification('ada@example.com', 'Ada', 'https://x.test/verify-email?token=t', '24 hours'));
        $this->assertCount(1, $bodies);
        $this->assertSame('template_auth', $bodies[0]['template_id']);
        foreach (['to_email', 'email', 'user_email'] as $name) {
            $this->assertSame('ada@example.com', $bodies[0]['template_params'][$name]);
        }
        $this->assertSame('Ada', $bodies[0]['template_params']['to_name']);
    }

    public function testEmptyOrMalformedRecipientIsNotSent(): void
    {
        $calls = 0;
        $mailer = new EmailJsVerificationMailer(self::MAIL, function () use (&$calls): array {
            $calls++;

            return [200, 'OK'];
        });

        $this->assertFalse($mailer->sendVerification('', 'Ada', 'https://x.test/v', '1 hour'));
        $this->assertFalse($mailer->sendVerification('not-an-email', 'Ada', 'https://x.test/v', '1 hour'));
        $this->assertSame(0, $calls);
    }

    public function testProviderRefusalIsReportedAsNotSent(): void
    {
        $mailer = new EmailJsVerificationMailer(self::MAIL, fn (): array => [422, 'The recipients address is empty']);

        $this->assertFalse($mailer->sendVerification('ada@example.com', 'Ada', 'https://x.test/v', '1 hour'));
    }
}
