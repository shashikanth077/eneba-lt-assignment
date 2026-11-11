<?php

declare(strict_types=1);

namespace App\Mail;

use App\Support\Log;

/**
 * Sends through EmailJS's REST API from the SERVER, so the verification link (a secret) never passes through the browser.
 * Uses the same "auth" template as the welcome e-mail; only the variables differ (docs/EMAIL.md). Needs the EmailJS private key
 * (access token) and "Allow EmailJS API for non-browser applications" switched on in the EmailJS dashboard.
 */
final class EmailJsVerificationMailer implements VerificationMailer
{
    private const ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

    /** @var \Closure(string): array{0: int, 1: string|false} posts the JSON body, returns [http status, answer]; replaceable in tests */
    private readonly \Closure $transport;

    /**
     * @param array{service_id: string, auth_template_id: string, public_key: string, private_key: string, company_name: string, support_email: string} $mail
     * @param (\Closure(string): array{0: int, 1: string|false})|null $transport
     */
    public function __construct(private readonly array $mail, ?\Closure $transport = null)
    {
        $this->transport = $transport ?? $this->post(...);
    }

    public function sendVerification(string $toEmail, string $toName, string $verifyUrl, string $expiresIn): bool
    {
        if (filter_var(trim($toEmail), FILTER_VALIDATE_EMAIL) === false) {
            // never log the value: only that the recipient is missing or malformed
            Log::error('mail.verification.invalid_recipient', 'verification e-mail NOT sent: the recipient address is empty or malformed', ['template' => $this->mail['auth_template_id']]);

            return false;
        }

        $payload = json_encode([
            'service_id' => $this->mail['service_id'],
            'template_id' => $this->mail['auth_template_id'],
            'user_id' => $this->mail['public_key'],
            'accessToken' => $this->mail['private_key'],
            'template_params' => [
                'to_email' => $toEmail,
                'email' => $toEmail,
                'user_email' => $toEmail,
                'to_name' => $toName,
                'email_subject' => 'Verify your email address – ' . $this->mail['company_name'],
                'email_heading' => 'Verify your email address',
                'email_message' => 'Thanks for registering with ' . $this->mail['company_name'] . '. Please verify your email address to activate your account and access all marketplace features.',
                'action_text' => 'Verify Email Address',
                'action_url' => $verifyUrl,
                'expiry_message' => $expiresIn,
                'company_name' => $this->mail['company_name'],
                'support_email' => $this->mail['support_email'],
                'current_year' => date('Y'),
            ],
        ], JSON_THROW_ON_ERROR);

        $started = microtime(true);
        [$status, $result] = ($this->transport)($payload);
        $ms = (int) round((microtime(true) - $started) * 1000);
        if ($result === false || $status !== 200) {
            // The payload is never logged (it holds the link and the address). EmailJS explains a refusal in its answer ("The Public Key is
            // invalid", "API calls are disabled for non-browser applications"...), which is exactly what is needed to fix it.
            Log::error('mail.verification.failed', 'EmailJS refused the verification e-mail', [
                'http_status' => $status,
                'provider_answer' => $result === false ? 'no answer (network error or timeout)' : $result,
                'template' => $this->mail['auth_template_id'],
                'ms' => $ms,
            ]);

            return false;
        }
        Log::info('mail.verification.sent', 'verification e-mail accepted by EmailJS', ['template' => $this->mail['auth_template_id'], 'ms' => $ms]);

        return true;
    }

    /** @return array{0: int, 1: string|false} */
    private function post(string $payload): array
    {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $payload,
            'timeout' => 5,
            'ignore_errors' => true,
        ]]);
        $result = @file_get_contents(self::ENDPOINT, false, $context);
        $status = (int) (preg_match('#HTTP/\S+ (\d{3})#', $http_response_header[0] ?? '', $m) ? $m[1] : 0);

        return [$status, $result];
    }
}
