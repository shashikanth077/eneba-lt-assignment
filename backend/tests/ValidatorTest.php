<?php

declare(strict_types=1);

namespace Tests;

use App\Exceptions\ValidationException;
use App\Support\Validator;
use PHPUnit\Framework\TestCase;

final class ValidatorTest extends TestCase
{
    public function testReturnsOnlyValidatedFieldsTrimmed(): void
    {
        $clean = Validator::validate(
            ['email' => ' a@b.co ', 'extra' => 'ignored'],
            ['email' => 'required|email|max:255'],
        );

        self::assertSame(['email' => 'a@b.co'], $clean);
    }

    public function testCollectsAllFieldErrors(): void
    {
        try {
            Validator::validate(['email' => 'nope', 'qty' => '9'], [
                'email' => 'required|email',
                'password' => 'required|string|min:8',
                'qty' => 'required|int|max:5',
            ]);
            self::fail('Expected ValidationException');
        } catch (ValidationException $e) {
            self::assertSame(422, $e->status());
            self::assertSame(['email', 'password', 'qty'], array_keys($e->details()['fields']));
        }
    }

    public function testOptionalFieldMayBeMissing(): void
    {
        self::assertSame([], Validator::validate(null, ['page' => 'int|min:1']));
    }
}
