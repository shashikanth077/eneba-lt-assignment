<?php

declare(strict_types=1);

namespace App\Support;

use Psr\Http\Message\ServerRequestInterface;

final class ClientIp
{
    /**
     * The address the per-IP limits are counted against.
     *
     * X-Forwarded-For is a list that every proxy APPENDS to; whatever the client itself sent sits at the LEFT and is under the
     * attacker's control. Trusting the first entry (the old code) let anyone pick a new "IP" per request and never be limited.
     * With $trustedProxies = N (the number of proxies we run or trust in front of the app) the client is the entry N places from the
     * RIGHT: that is the address the outermost trusted proxy actually saw. Too few entries, or a value that is not an IP, means the
     * header cannot be trusted and the connection's own address is used. 0 = no proxy: the header is ignored.
     */
    public static function from(ServerRequestInterface $request, int $trustedProxies): string
    {
        if ($trustedProxies > 0) {
            $entries = array_map('trim', explode(',', $request->getHeaderLine('X-Forwarded-For')));
            $candidate = $entries[count($entries) - $trustedProxies] ?? '';
            if (count($entries) >= $trustedProxies && filter_var($candidate, FILTER_VALIDATE_IP) !== false) {
                return $candidate;
            }
        }

        return (string) ($request->getServerParams()['REMOTE_ADDR'] ?? '0.0.0.0');
    }
}
