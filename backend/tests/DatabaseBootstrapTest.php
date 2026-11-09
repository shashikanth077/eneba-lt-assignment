<?php

declare(strict_types=1);

namespace Tests;

use App\Support\DatabaseBootstrap;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;

final class DatabaseBootstrapTest extends DbTestCase
{
    /** @return array<string, array{string}> */
    public static function unsafeNames(): array
    {
        return [
            'empty' => [''],
            'backtick injection' => ['x`; DROP DATABASE keymart; --'],
            'space' => ['my db'],
            'dash' => ['my-db'],
            'dot' => ['a.b'],
            'too long' => [str_repeat('a', 65)],
        ];
    }

    #[DataProvider('unsafeNames')]
    public function testUnsafeDatabaseNamesAreRejectedBeforeAnySql(string $name): void
    {
        $this->expectException(InvalidArgumentException::class);
        DatabaseBootstrap::assertSafeName($name);
    }

    public function testPlainNamesAreAccepted(): void
    {
        DatabaseBootstrap::assertSafeName('keymart');
        DatabaseBootstrap::assertSafeName('keymart_test_2');
        $this->expectNotToPerformAssertions();
    }

    public function testEnsureExistsCreatesAMissingDatabaseOnceAndLeavesAnExistingOneAlone(): void
    {
        $name = 'keymart_bootstrap_' . bin2hex(random_bytes(3));
        $db = ['name' => $name] + (require __DIR__ . '/../config/settings.php')()['db'];
        $server = DatabaseBootstrap::connectToServer($db);
        try {
            try {
                $created = DatabaseBootstrap::ensureExists($db);
            } catch (\PDOException $e) {
                if (($e->errorInfo[1] ?? 0) === 1044) {
                    self::markTestSkipped('The test DB user may not create databases (XAMPP\'s root can).');
                }
                throw $e;
            }
            self::assertTrue($created, 'created');
            self::assertFalse(DatabaseBootstrap::ensureExists($db), 'second call changes nothing');
            $charset = $server->query("SELECT default_character_set_name FROM information_schema.schemata WHERE schema_name = '$name'")->fetchColumn();
            self::assertSame('utf8mb4', $charset);
        } finally {
            try {
                $server->exec("DROP DATABASE IF EXISTS `$name`");
            } catch (\PDOException) {
                // no privilege: nothing was created either
            }
        }
    }
}
