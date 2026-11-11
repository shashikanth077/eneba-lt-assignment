<?php

declare(strict_types=1);

namespace App\Support;

use Throwable;

/**
 * The application log: one JSON object per line on the process's error stream, which is where Vercel and Railway collect a service's logs
 * (docs/LOGGING.md). Every line has a level (debug, info, warn, error), an `event` name of the form area.what, a human message and a
 * `request_id` that ties together every line of one request. Secrets never reach a line: sensitive field names are redacted by name,
 * e-mail addresses are masked (use maskEmail), long values are cut.
 *
 * Static on purpose: it is a cross-cutting tool used from controllers, services, middleware and CLI scripts alike, and a log call must
 * never need wiring or be able to fail a request (a broken sink is swallowed).
 */
final class Log
{
    private const LEVELS = ['debug' => 10, 'info' => 20, 'warn' => 30, 'error' => 40, 'off' => 100];
    /** Field names that are replaced by "[redacted]" whatever they hold. */
    private const SENSITIVE = '/pass|secret|token|authorization|cookie|card|cvc|signature|key|credential/i';
    private const MAX_VALUE = 300;

    private static int $minimum = 20;
    /** @var array<string, mixed> */
    private static array $context = [];
    /** @var (callable(string): void)|null */
    private static $sink = null;

    public static function configure(string $level): void
    {
        self::$minimum = self::LEVELS[strtolower(trim($level))] ?? self::LEVELS['info'];
    }

    /** Fields added to every line until reset() (request id, user id). */
    public static function addContext(string $name, mixed $value): void
    {
        self::$context[$name] = $value;
    }

    public static function context(string $name): mixed
    {
        return self::$context[$name] ?? null;
    }

    public static function reset(): void
    {
        self::$context = [];
    }

    /** Tests (and anything else that wants the lines) replace the destination; null restores error_log. */
    public static function setSink(?callable $sink): void
    {
        self::$sink = $sink;
    }

    /** @param array<string, mixed> $fields */
    public static function debug(string $event, string $message, array $fields = []): void
    {
        self::write('debug', $event, $message, $fields);
    }

    /** @param array<string, mixed> $fields */
    public static function info(string $event, string $message, array $fields = []): void
    {
        self::write('info', $event, $message, $fields);
    }

    /** Something went wrong or was refused, and the system carried on (a rejected login, a missing setting, out of stock). */
    public static function warn(string $event, string $message, array $fields = []): void
    {
        self::write('warn', $event, $message, $fields);
    }

    /** Something that should not happen and needs a person (a failed payment call, an unhandled exception, an e-mail that was refused). */
    public static function error(string $event, string $message, array $fields = []): void
    {
        self::write('error', $event, $message, $fields);
    }

    /** "ana@example.com" -> "a***@example.com": enough to tell two addresses apart in a log, not enough to contact anybody. */
    public static function maskEmail(string $email): string
    {
        $at = strrpos($email, '@');
        if ($at === false || $at === 0) {
            return '***';
        }

        return $email[0] . '***' . substr($email, $at);
    }

    /** @param array<string, mixed> $fields */
    private static function write(string $level, string $event, string $message, array $fields): void
    {
        if (self::LEVELS[$level] < self::$minimum) {
            return;
        }
        try {
            $line = json_encode(
                ['ts' => gmdate('Y-m-d\TH:i:s\Z'), 'level' => $level, 'event' => $event, 'msg' => $message]
                + self::clean(self::$context)
                + self::clean($fields),
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR,
            );
            if (self::$sink !== null) {
                (self::$sink)($line);
            } else {
                error_log('KEYMART ' . $line);
            }
        } catch (Throwable) {
            // logging must never break the request it describes
        }
    }

    /**
     * @param array<string, mixed> $fields
     * @return array<string, mixed>
     */
    private static function clean(array $fields): array
    {
        $clean = [];
        foreach ($fields as $name => $value) {
            if (preg_match(self::SENSITIVE, (string) $name) === 1) {
                $clean[$name] = '[redacted]';
            } elseif ($value instanceof Throwable) {
                $clean[$name] = $value::class . ': ' . self::cut($value->getMessage());
            } elseif (is_array($value)) {
                $clean[$name] = self::clean($value);
            } elseif (is_string($value)) {
                $clean[$name] = self::cut($value);
            } elseif (is_scalar($value) || $value === null) {
                $clean[$name] = $value;
            } else {
                $clean[$name] = get_debug_type($value);
            }
        }

        return $clean;
    }

    private static function cut(string $value): string
    {
        return mb_strlen($value) > self::MAX_VALUE ? mb_substr($value, 0, self::MAX_VALUE) . '...' : $value;
    }
}
