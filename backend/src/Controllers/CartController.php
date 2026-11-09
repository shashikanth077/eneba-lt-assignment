<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\JsonResponse;
use App\Services\CartService;
use App\Support\Validator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** All cart routes sit behind AuthMiddleware; the cart is always the caller's own. */
final class CartController
{
    public function __construct(private readonly CartService $cart)
    {
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::write($response, $this->cart->view($this->userId($request)));
    }

    /** Body: { offerId, qty? (default 1) }. Any price in the body is ignored: there is no price field to send. */
    public function add(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = Validator::validate($this->body($request), ['offerId' => 'required|int|min:1', 'qty' => 'int|min:1|max:' . \App\Services\CartService::MAX_QTY_PER_LINE]);

        return JsonResponse::write($response, $this->cart->add($this->userId($request), (int) $data['offerId'], (int) ($data['qty'] ?? 1)), 201);
    }

    /** Body: { qty } sets the quantity of the line. */
    public function update(ServerRequestInterface $request, ResponseInterface $response, string $offerId): ResponseInterface
    {
        $data = Validator::validate($this->body($request), ['qty' => 'required|int|min:1|max:' . \App\Services\CartService::MAX_QTY_PER_LINE]);

        return JsonResponse::write($response, $this->cart->setQuantity($this->userId($request), self::id($offerId), (int) $data['qty']));
    }

    public function remove(ServerRequestInterface $request, ResponseInterface $response, string $offerId): ResponseInterface
    {
        return JsonResponse::write($response, $this->cart->remove($this->userId($request), self::id($offerId)));
    }

    public function clear(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponse::write($response, $this->cart->clear($this->userId($request)));
    }

    private function userId(ServerRequestInterface $request): int
    {
        return (int) $request->getAttribute('user')['id'];
    }

    private static function id(string $raw): int
    {
        return ctype_digit($raw) ? (int) $raw : 0; // 0 matches no offer, so it ends in a plain 404
    }

    /** @return array<string, mixed> */
    private function body(ServerRequestInterface $request): array
    {
        $body = $request->getParsedBody();

        return is_array($body) ? $body : [];
    }
}
