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
use App\Support\Log;
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

        try {
            $user = $this->auth->register($data['email'], $data['password'], $data['displayName']);
        } catch (ApiException $e) {
            Log::warn('auth.register.refused', 'sign-up refused: ' . $e->errorCode(), ['reason' => $e->errorCode(), 'email' => Log::maskEmail($data['email'])]);
            throw $e;
        }
        Log::info('auth.register.ok', 'account created', ['user_id' => $user['id'], 'email' => Log::maskEmail($user['email'])]);
        $this->verification->sendTo($user['id'], $user['email'], $user['display_name']); // best effort: never fails the sign-up

        return $this->signedIn($response, $user, 201);
    }

    public function login(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = Validator::validate($this->body($request), [
            'email' => 'required|string|email|max:255',
            'password' => 'required|string|max:128',
        ]);

        $ip = ClientIp::from($request, $this->trustedProxies);
        try {
            $user = $this->auth->login($data['email'], $data['password'], $ip);
        } catch (ApiException $e) {
            // the client always gets the same answer for "unknown e-mail" and "wrong password"; the log may be specific, the client never is
            Log::warn('auth.login.failed', 'sign-in refused: ' . $e->errorCode(), ['reason' => $e->errorCode(), 'email' => Log::maskEmail($data['email']), 'ip' => $ip]);
            throw $e;
        }
        Log::info('auth.login.ok', 'signed in', ['user_id' => $user['id']]);

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
        try {
            $this->verification->verify($data['token']);
        } catch (ApiException $e) {
            Log::warn('auth.verify.failed', 'e-mail verification link refused (unknown, expired or already used)', ['reason' => $e->errorCode()]);
            throw $e;
        }
        Log::info('auth.verify.ok', 'e-mail address verified');

        return JsonResponse::write($response, ['verified' => true]);
    }

    /** Signed in: sends a new link (the old ones stop working). Limited per account in the routes. */
    public function resendVerification(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute('user');
        if ($user['email_verified_at'] !== null) {
            throw ApiException::conflict('already_verified', 'This email address is already verified');
        }
        Log::info('auth.verify.resend', 'a new verification link was requested', ['user_id' => $user['id']]);
        $this->verification->sendTo($user['id'], $user['email'], $user['display_name']);

        return JsonResponse::write($response, ['sent' => true], 202);
    }

    /** Edit profile: the display name (the e-mail is the login and is verified, so it is not editable here). */
    public function updateProfile(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = Validator::validate($this->body($request), ['displayName' => 'required|string|min:2|max:50']);
        $user = $this->auth->updateProfile($request->getAttribute('user')['id'], trim($data['displayName']));
        Log::info('auth.profile.updated', 'display name changed', ['user_id' => $user['id']]);

        return JsonResponse::write($response, ['user' => self::present($user)]);
    }

    public function changePassword(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = Validator::validate($this->body($request), [
            'currentPassword' => 'required|string|max:128',
            'newPassword' => 'required|string|min:8|max:128',
        ]);
        $id = $request->getAttribute('user')['id'];
        try {
            $user = $this->auth->changePassword($id, $data['currentPassword'], $data['newPassword']);
        } catch (\Throwable $e) {
            Log::warn('auth.password.refused', 'password change refused: ' . ($e instanceof ApiException ? $e->errorCode() : 'validation_failed'), ['user_id' => $id]);
            throw $e;
        }
        Log::info('auth.password.changed', 'password changed, other sessions revoked', ['user_id' => $id]);

        return $this->signedIn($response, $user, 200); // a fresh cookie for this device; every other session was just revoked
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
