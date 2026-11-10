<?php

declare(strict_types=1);

namespace Tests;

use Database\Seeds\DatabaseSeeder;
use App\Support\KeyCipher;

final class HealthStockTest extends DbTestCase
{
    public function testHealthSaysWhenNothingIsBuyableSoEmptyListsAreExplained(): void
    {
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['cart_items', 'order_items', 'game_keys'] as $table) {
            self::$pdo->exec("TRUNCATE TABLE $table");
        }
        self::$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        $empty = $this->json($this->send('GET', '/api/health'));
        self::assertSame(['status' => 'ok', 'db' => 'ok', 'stock' => 'empty'], $empty);

        (new DatabaseSeeder(self::$pdo, KeyCipher::fromBase64((string) $_ENV['KEY_ENCRYPTION_KEY'])))->run();
        self::assertSame('ok', $this->json($this->send('GET', '/api/health'))['stock']);
    }
}
