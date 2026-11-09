<?php

declare(strict_types=1);

namespace App\Exceptions;

final class ValidationException extends ApiException
{
    /** @param array<string, list<string>> $fields field name => messages */
    public function __construct(array $fields)
    {
        parent::__construct(422, 'validation_failed', 'The request data is invalid', ['fields' => $fields]);
    }
}
