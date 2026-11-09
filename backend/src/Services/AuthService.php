<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Repositories\UserRepository;

/** @phpstan-import-type User from UserRepository */
final class AuthService
{
    private static ?string $dummyHash = null;

    public function __construct(
        private readonly UserRepository $users,
        private readonly LoginThrottle $throttle,
    ) {
    }

    /**
     * @return User
     * @throws ApiException 409 email_taken
     */
    public function register(string $email, string $password, string $displayName): array
    {
        $email = self::normalizeEmail($email);
        $id = $this->users->create($email, password_hash($password, PASSWORD_ARGON2ID), $displayName);

        return $this->users->findById($id) ?? throw new \RuntimeException('User vanished after insert');
    }

    /**
     * Same answer (message, status, roughly the same time) for "no such email" and "wrong password".
     *
     * @return User
     * @throws ApiException 401 invalid_credentials | 429 too_many_attempts
     */
    public function login(string $email, string $password, string $ip): array
    {
        $email = self::normalizeEmail($email);
        $emailHash = LoginThrottle::emailHash($email);
        $this->throttle->assertAllowed($ip, $emailHash);

        $user = $this->users->findByEmail($email);
        // Verify against a dummy hash when the user is unknown so response time does not reveal it.
        $valid = password_verify($password, $user['password_hash'] ?? self::dummyHash());

        if ($user === null || !$valid) {
            $this->throttle->recordFailure($ip, $emailHash);
            throw new ApiException(401, 'invalid_credentials', 'Invalid email or password');
        }

        $this->throttle->reset($ip, $emailHash);
        if (password_needs_rehash($user['password_hash'], PASSWORD_ARGON2ID)) {
            $this->users->updatePasswordHash($user['id'], password_hash($password, PASSWORD_ARGON2ID));
        }

        return $user;
    }

    /** Invalidates every token issued so far for this user (token_version claim no longer matches). */
    public function revokeSessions(int $userId): void
    {
        $this->users->bumpTokenVersion($userId);
    }

    private static function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email));
    }

    private static function dummyHash(): string
    {
        return self::$dummyHash ??= password_hash(bin2hex(random_bytes(8)), PASSWORD_ARGON2ID);
    }
}
