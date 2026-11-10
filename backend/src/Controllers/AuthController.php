<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Auth\SessionCookie;
use App\Auth\TokenService;
use App\Http\JsonResponse;
use App\Services\AuthService;
use App\Support\ClientIp;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class AuthController
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly TokenService $tokens,
        private readonly SessionCookie $cookie,
        /** how many proxies in front of the app we trust to append to X-Forwarded-For (0 = none), see ClientIp */
        private readonly int $trustedProxies,
    ) {
    }

    public function register(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = Validator::validate($this->body($request), [
            'email' => 'required|string|email|max:255',
            'password' => 'required|string|min:8|max:128',
            'displayName' => 'required|string|min:2|max:50',
        ]);

        $user = $this->auth->register($data['email'], $data['password'], $data['displayName']);

        return $this->signedIn($response, $user, 201);
    }

    public function login(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = Validator::validate($this->body($request), [
            'email' => 'required|string|email|max:255',
            'password' => 'required|string|max:128',
        ]);

        $user = $this->auth->login($data['email'], $data['password'], ClientIp::from($request, $this->trustedProxies));

        return $this->signedIn($response, $user, 200);
    }

    /** Public and idempotent: always clears the cookie; if the token is valid it is also revoked server-side. */
    public function logout(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $jwt = $request->getCookieParams()[SessionCookie::NAME] ?? '';
        if (is_string($jwt) && $jwt !== '') {
            try {
                $this->auth->revokeSessions($this->tokens->parse($jwt)['sub']);
            } catch (\App\Exceptions\ApiException) {
                // expired or forged token: nothing to revoke, still clear the cookie
            }
        }

        return $this->cookie->clear($response->withStatus(204));
    }

    public function me(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::write($response, ['user' => self::present($request->getAttribute('user'))]);
    }

    /** @param array{id: int, email: string, display_name: string, token_version: int} $user */
    private function signedIn(ResponseInterface $response, array $user, int $status): ResponseInterface
    {
        $jwt = $this->tokens->issue($user['id'], $user['token_version']);

        return $this->cookie->set(JsonResponse::write($response, ['user' => self::present($user)], $status), $jwt);
    }

    /**
     * @param array{id: int, email: string, display_name: string} $user
     * @return array{id: int, email: string, displayName: string}
     */
    private static function present(array $user): array
    {
        return ['id' => $user['id'], 'email' => $user['email'], 'displayName' => $user['display_name']];
    }

    /** @return array<string, mixed> */
    private function body(ServerRequestInterface $request): array
    {
        $body = $request->getParsedBody();

        return is_array($body) ? $body : [];
    }
}
