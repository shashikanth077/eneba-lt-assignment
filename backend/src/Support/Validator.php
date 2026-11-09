<?php

declare(strict_types=1);

namespace App\Support;

use App\Exceptions\ValidationException;

/**
 * Tiny request validator. Rules are pipe-separated per field:
 *   required | nullable | string | int | bool | email | min:N | max:N | in:a,b
 * min/max mean length for strings and value for ints.
 * Returns only the validated fields; throws ValidationException (422) otherwise.
 *
 *   $data = Validator::validate($body, ['email' => 'required|email|max:255']);
 */
final class Validator
{
    /**
     * @param array<string, mixed>|null $input
     * @param array<string, string> $rules
     * @return array<string, mixed>
     */
    public static function validate(?array $input, array $rules): array
    {
        $input ??= [];
        $errors = [];
        $clean = [];

        foreach ($rules as $field => $ruleString) {
            $rulesOfField = explode('|', $ruleString);
            $present = array_key_exists($field, $input) && $input[$field] !== null && $input[$field] !== '';

            if (!$present) {
                if (in_array('required', $rulesOfField, true)) {
                    $errors[$field][] = 'This field is required';
                }
                continue;
            }

            $value = is_string($input[$field]) ? trim($input[$field]) : $input[$field];
            foreach ($rulesOfField as $rule) {
                $message = self::check($rule, $value, $rulesOfField);
                if ($message !== null) {
                    $errors[$field][] = $message;
                }
            }
            if (!isset($errors[$field])) {
                $clean[$field] = $value;
            }
        }

        if ($errors !== []) {
            throw new ValidationException($errors);
        }

        return $clean;
    }

    /** @param list<string> $all */
    private static function check(string $rule, mixed $value, array $all): ?string
    {
        [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);

        return match ($name) {
            'string' => is_string($value) ? null : 'Must be a string',
            'int' => is_int($value) || (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) ? null : 'Must be an integer',
            'bool' => is_bool($value) ? null : 'Must be true or false',
            'email' => is_string($value) && filter_var($value, FILTER_VALIDATE_EMAIL) !== false ? null : 'Must be a valid email address',
            'in' => is_scalar($value) && in_array((string) $value, explode(',', (string) $arg), true) ? null : 'Must be one of: ' . $arg,
            'min' => !is_scalar($value) || self::size($value, $all) >= (int) $arg ? null : 'Must be at least ' . $arg . (self::isNumeric($all) ? '' : ' characters'),
            'max' => !is_scalar($value) || self::size($value, $all) <= (int) $arg ? null : 'Must be at most ' . $arg . (self::isNumeric($all) ? '' : ' characters'),
            default => null, // required / nullable are handled by the caller
        };
    }

    /** @param list<string> $all */
    private static function isNumeric(array $all): bool
    {
        return in_array('int', $all, true);
    }

    /** @param list<string> $all */
    private static function size(mixed $value, array $all): int
    {
        return self::isNumeric($all) ? (int) $value : mb_strlen((string) $value);
    }
}
