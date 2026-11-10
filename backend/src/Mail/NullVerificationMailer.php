<?php

declare(strict_types=1);

namespace App\Mail;

/** Used when EmailJS is not configured: the app works, nothing is sent. */
final class NullVerificationMailer implements VerificationMailer
{
    public function sendVerification(string $toEmail, string $toName, string $verifyUrl, string $expiresIn): bool
    {
        return false;
    }
}
