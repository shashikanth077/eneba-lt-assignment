<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Reads a connection URL such as Railway's MYSQL_URL (mysql://user:password@host:port/database) into the same parts the rest of the
 * configuration uses. Credentials are percent-decoded (a generated password may contain characters that are escaped in a URL).
 * Anything that is not a mysql:// URL with a host gives an empty result, so a malformed value can never half-configure the app.
 */
final class DatabaseUrl
{
    /** @return array{host?: string, port?: int, user?: string, pass?: string, name?: string} */
    public static function parse(string $url): array
    {
        if ($url === '') {
            return [];
        }
        $parts = parse_url($url);
        if ($parts === false || !in_array($parts['scheme'] ?? '', ['mysql', 'mariadb'], true) || ($parts['host'] ?? '') === '') {
            return [];
        }
        $result = ['host' => $parts['host']];
        if (isset($parts['port'])) {
            $result['port'] = (int) $parts['port'];
        }
        if (isset($parts['user'])) {
            $result['user'] = rawurldecode($parts['user']);
        }
        if (isset($parts['pass'])) {
            $result['pass'] = rawurldecode($parts['pass']);
        }
        $name = ltrim($parts['path'] ?? '', '/');
        if ($name !== '') {
            $result['name'] = rawurldecode($name);
        }

        return $result;
    }
}
