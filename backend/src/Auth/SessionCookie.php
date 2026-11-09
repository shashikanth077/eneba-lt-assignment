<?php

declare(strict_types=1);

namespace App\Auth;

use Psr\Http\Message\ResponseInterface;

/** Builds the Set-Cookie header. HttpOnly keeps the JWT away from JavaScript; SameSite=Lax blocks cross-site POSTs. */
final class SessionCookie
{
    public const NAME = 'session';

    public function __construct(private readonly int $ttlSeconds, private readonly bool $secure)
    {
    }

    public function set(ResponseInterface $response, string $jwt): ResponseInterface
    {
        return $response->withAddedHeader('Set-Cookie', $this->build($jwt, $this->ttlSeconds));
    }

    public function clear(ResponseInterface $response): ResponseInterface
    {
        return $response->withAddedHeader('Set-Cookie', $this->build('', 0));
    }

    private function build(string $value, int $maxAge): string
    {
        return sprintf(
            '%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Lax%s',
            self::NAME,
            $value,
            $maxAge,
            $this->secure ? '; Secure' : '',
        );
    }
}
