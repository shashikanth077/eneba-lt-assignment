<?php

declare(strict_types=1);

namespace App\Auth;

use App\Exceptions\ApiException;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use RuntimeException;
use Throwable;

/** Issues and verifies the session JWT (HS256). Claims: sub = user id, tv = token version, iat, exp. */
final class TokenService
{
    private const ALGORITHM = 'HS256';

    public function __construct(private readonly string $secret, private readonly int $ttlSeconds)
    {
        if (strlen($secret) < 32) {
            throw new RuntimeException('JWT_SECRET must be set and at least 32 characters long');
        }
    }

    /** @param int|null $now unix time override, only for tests */
    public function issue(int $userId, int $tokenVersion, ?int $now = null): string
    {
        $now ??= time();

        return JWT::encode(
            ['sub' => (string) $userId, 'tv' => $tokenVersion, 'iat' => $now, 'exp' => $now + $this->ttlSeconds],
            $this->secret,
            self::ALGORITHM,
        );
    }

    /** @return array{sub: int, tv: int} */
    public function parse(string $jwt): array
    {
        try {
            $claims = (array) JWT::decode($jwt, new Key($this->secret, self::ALGORITHM));
        } catch (ExpiredException) {
            throw new ApiException(401, 'token_expired', 'Your session has expired, please sign in again');
        } catch (Throwable) {
            throw new ApiException(401, 'invalid_token', 'Invalid session');
        }
        if (!isset($claims['sub'], $claims['tv']) || !ctype_digit((string) $claims['sub'])) {
            throw new ApiException(401, 'invalid_token', 'Invalid session');
        }

        return ['sub' => (int) $claims['sub'], 'tv' => (int) $claims['tv']];
    }

    public function ttlSeconds(): int
    {
        return $this->ttlSeconds;
    }
}
