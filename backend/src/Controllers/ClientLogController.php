<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\JsonResponse;
use App\Support\Log;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Lets the browser report what only the browser can see (the order e-mail it sends through EmailJS, a payment page that gave up, an
 * uncaught error) so it appears in the SAME server log as everything else, tied to the same request ids. The browser cannot choose the
 * level or invent events: the event name must be one of those below, the level comes from this table, and only the listed fields are kept,
 * as short plain strings. No address, name, key or token is ever expected here.
 */
final class ClientLogController
{
    /** event => level the server writes it at */
    private const EVENTS = [
        'email.sent' => 'info',
        'email.skipped' => 'warn',
        'email.invalid' => 'warn',
        'email.failed' => 'error',
        'payment.poll.gave_up' => 'warn',
        'checkout.failed' => 'error',
        'app.error' => 'error',
    ];
    private const FIELDS = ['kind', 'reason', 'status', 'order_id', 'message', 'route', 'missing'];

    public function report(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $request->getParsedBody();
        $event = is_array($body) && is_string($body['event'] ?? null) ? $body['event'] : '';
        if (!isset(self::EVENTS[$event])) {
            return JsonResponse::error($response, 422, 'validation_failed', 'Unknown event');
        }

        $fields = ['source' => 'browser'];
        $given = is_array($body['fields'] ?? null) ? $body['fields'] : [];
        foreach (self::FIELDS as $name) {
            $value = $given[$name] ?? null;
            if (is_string($value) || is_int($value)) {
                $fields[$name] = is_string($value) ? mb_substr($value, 0, 200) : $value;
            }
        }
        $level = self::EVENTS[$event];
        Log::$level('browser.' . $event, 'reported by the browser: ' . $event, $fields);

        return $response->withStatus(204);
    }
}
