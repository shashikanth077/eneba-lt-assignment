<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Mail\VerificationMailer;
use App\Support\ConfigGuard;
use PDO;

/**
 * Time-limited, single-use e-mail verification. The token is 256 random bits, shown once (inside the link) and stored only as a hash.
 * Unknown, expired and already-used tokens get the same answer, so the endpoint tells a guesser nothing.
 */
final class EmailVerificationService
{
    /** @param array<string, mixed> $settings the whole settings array (app_url, env and mail are read) */
    public function __construct(
        private readonly PDO $pdo,
        private readonly VerificationMailer $mailer,
        private readonly array $settings,
    ) {
    }

    /** Creates a fresh token for the user (older unused ones stop working) and e-mails the link. Never throws for delivery problems. */
    public function sendTo(int $userId, string $email, string $displayName): bool
    {
        $base = rtrim((string) $this->settings['app_url'], '/');
        if (!str_starts_with($base, 'https://') && !ConfigGuard::isLocal($this->settings)) {
            error_log('[mail] verification e-mail not sent: APP_URL must be https:// outside local development');

            return false;
        }

        $token = bin2hex(random_bytes(32));
        $hours = max(1, (int) $this->settings['mail']['verification_ttl_hours']);
        $this->pdo->prepare('DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL')->execute([$userId]);
        $this->pdo->prepare(
            'INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
        )->execute([$userId, hash('sha256', $token), $hours]);

        return $this->mailer->sendVerification(
            $email,
            $displayName,
            $base . '/verify-email?token=' . $token,
            $hours === 1 ? '1 hour' : $hours . ' hours',
        );
    }

    /** @throws ApiException 400 invalid_verification_token */
    public function verify(string $token): void
    {
        $this->pdo->beginTransaction();
        try {
            $find = $this->pdo->prepare(
                'SELECT id, user_id FROM email_verifications WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE',
            );
            $find->execute([hash('sha256', $token)]);
            $row = $find->fetch();
            if ($row === false) {
                throw ApiException::badRequest('This verification link is invalid or has expired. Request a new one from your account.');
            }
            $this->pdo->prepare('UPDATE email_verifications SET used_at = NOW() WHERE id = ?')->execute([$row['id']]);
            $this->pdo->prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?')->execute([$row['user_id']]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }
}
