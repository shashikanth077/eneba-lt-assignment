<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Auth\SessionCookie;
use App\Auth\TokenService;
use App\Exceptions\ApiException;
use App\Repositories\UserRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Guards a route: valid JWT cookie + user still exists + token version unchanged.
 * On success the user row is available as the request attribute "user".
 */
final class AuthMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly TokenService $tokens,
        private readonly UserRepository $users,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $jwt = $request->getCookieParams()[SessionCookie::NAME] ?? '';
        if ($jwt === '' || !is_string($jwt)) {
            throw ApiException::unauthorized();
        }

        $claims = $this->tokens->parse($jwt);
        $user = $this->users->findById($claims['sub']);
        if ($user === null || $user['token_version'] !== $claims['tv']) {
            throw new ApiException(401, 'invalid_token', 'Invalid session');
        }

        return $handler->handle($request->withAttribute('user', $user));
    }
}
