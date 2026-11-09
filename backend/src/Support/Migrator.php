<?php

declare(strict_types=1);

namespace App\Support;

use PDO;

/** Applies database/migrations/*.sql in filename order, once each (tracked in schema_migrations). */
final class Migrator
{
    public function __construct(private readonly PDO $pdo, private readonly string $directory)
    {
    }

    /** @return list<string> names of the migrations applied by this call */
    public function run(): array
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
                filename VARCHAR(190) NOT NULL PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        $done = $this->pdo->query('SELECT filename FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);

        $files = glob($this->directory . '/*.sql') ?: [];
        sort($files);

        $applied = [];
        foreach ($files as $file) {
            $name = basename($file);
            if (in_array($name, $done, true)) {
                continue;
            }
            $this->pdo->exec((string) file_get_contents($file)); // DDL auto-commits, so no wrapping transaction
            $this->pdo->prepare('INSERT INTO schema_migrations (filename) VALUES (?)')->execute([$name]);
            $applied[] = $name;
        }

        return $applied;
    }
}
