<?php

declare(strict_types=1);

namespace App\Mail;

use App\Support\Log;

/** Used when EmailJS is not configured: the app works, nothing is sent, and the log says exactly which settings are missing. */
final class NullVerificationMailer implements VerificationMailer
{
    /** @param list<string> $missing names of the environment variables that are not set */
    public function __construct(private readonly array $missing = [])
    {
    }

    public function sendVerification(string $toEmail, string $toName, string $verifyUrl, string $expiresIn): bool
    {
        Log::warn('mail.verification.skipped', 'verification e-mail NOT sent: EmailJS is not configured on the server', [
            'missing_settings' => implode(',', $this->missing),
            'to' => Log::maskEmail($toEmail),
        ]);

        return false;
    }
}
