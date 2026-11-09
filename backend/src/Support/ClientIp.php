<?php

declare(strict_types=1);

namespace App\Support;

use Psr\Http\Message\ServerRequestInterface;

final class ClientIp
{
    /** X-Forwarded-For is only trusted when the app really runs behind a proxy (TRUST_PROXY=true). */
    public static function from(ServerRequestInterface $request, bool $trustProxy): string
    {
        if ($trustProxy) {
            $forwarded = trim(explode(',', $request->getHeaderLine('X-Forwarded-For'))[0]);
            if (filter_var($forwarded, FILTER_VALIDATE_IP) !== false) {
                return $forwarded;
            }
        }

        return (string) ($request->getServerParams()['REMOTE_ADDR'] ?? '0.0.0.0');
    }
}
