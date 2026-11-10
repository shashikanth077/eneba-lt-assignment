<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Auth\SessionCookie;
use App\Auth\TokenService;
use App\Exceptions\ApiException;
use App\Http\JsonResponse;
use App\Services\AuthService;
use App\Services\EmailVerificationService;
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
        private readonly EmailVerificationService $verification,
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
        $this->verification->sendTo($user['id'], $user['email'], $user['display_name']); // best effort: never fails the sign-up

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

    /** Public: the one-time token in the link is the proof (the link may be opened in another browser). */
    public function verifyEmail(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = Validator::validate($this->body($request), ['token' => 'required|string|min:32|max:128']);
        $this->verification->verify($data['token']);

        return JsonResponse::write($response, ['verified' => true]);
    }

    /** Signed in: sends a new link (the old ones stop working). Limited per account in the routes. */
    public function resendVerification(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute('user');
        if ($user['email_verified_at'] !== null) {
            throw ApiException::conflict('already_verified', 'This email address is already verified');
        }
        $this->verification->sendTo($user['id'], $user['email'], $user['display_name']);

        return JsonResponse::write($response, ['sent' => true], 202);
    }

    public function me(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::write($response, ['user' => self::present($request->getAttribute('user'))]);
    }

    /** @param array{id: int, email: string, display_name: string, email_verified_at: ?string, token_version: int} $user */
    private function signedIn(ResponseInterface $response, array $user, int $status): ResponseInterface
    {
        $jwt = $this->tokens->issue($user['id'], $user['token_version']);

        return $this->cookie->set(JsonResponse::write($response, ['user' => self::present($user)], $status), $jwt);
    }

    /**
     * @param array{id: int, email: string, display_name: string, email_verified_at: ?string} $user
     * @return array{id: int, email: string, displayName: string, emailVerified: bool}
     */
    private static function present(array $user): array
    {
        return ['id' => $user['id'], 'email' => $user['email'], 'displayName' => $user['display_name'], 'emailVerified' => $user['email_verified_at'] !== null];
    }

    /** @return array<string, mixed> */
    private function body(ServerRequestInterface $request): array
    {
        $body = $request->getParsedBody();

        return is_array($body) ? $body : [];
    }
}
