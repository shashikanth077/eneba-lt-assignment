<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * An error the client should see. The error handler turns it into
 * {"error":{"code","message","details"}} with the given HTTP status.
 */
class ApiException extends RuntimeException
{
    /** @param array<string, mixed>|null $details */
    public function __construct(
        private readonly int $status,
        private readonly string $errorCode,
        string $message,
        private readonly ?array $details = null,
    ) {
        parent::__construct($message);
    }

    public function status(): int
    {
        return $this->status;
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    /** @return array<string, mixed>|null */
    public function details(): ?array
    {
        return $this->details;
    }

    /** @param array<string, mixed>|null $details */
    public static function badRequest(string $message, ?array $details = null): self
    {
        return new self(400, 'bad_request', $message, $details);
    }

    public static function unauthorized(string $message = 'Authentication required'): self
    {
        return new self(401, 'unauthorized', $message);
    }

    public static function notFound(string $message = 'Resource not found'): self
    {
        return new self(404, 'not_found', $message);
    }

    /** @param array<string, mixed>|null $details */
    public static function conflict(string $code, string $message, ?array $details = null): self
    {
        return new self(409, $code, $message, $details);
    }
}
