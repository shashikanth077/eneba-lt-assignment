<?php

declare(strict_types=1);

namespace App\Mail;

/** Sends the account e-mail that carries a verification link. Delivery is best effort: a failure must never break sign-up. */
interface VerificationMailer
{
    /** @return bool true when the provider accepted the message */
    public function sendVerification(string $toEmail, string $toName, string $verifyUrl, string $expiresIn): bool;
}
