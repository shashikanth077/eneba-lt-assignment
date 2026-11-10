<?php

declare(strict_types=1);

use App\Support\KeyCipher;

/**
 * Adds REAL game keys to one offer's stock (the only supported way to load real inventory).
 *
 *   php bin/import_keys.php <offer id> <file with one key per line | ->
 *
 * Each key is encrypted with KEY_ENCRYPTION_KEY and stored as `available`. A key that already exists (same fingerprint, in any
 * state, sold ones included) is skipped, so running the same file twice adds nothing and can never hand a delivered key out again.
 * Everything happens in one transaction: either all new keys are stored or none. Keys are never printed.
 */
$container = require __DIR__ . '/_boot.php';
$offerId = (int) ($argv[1] ?? 0);
$source = $argv[2] ?? '';
if ($offerId <= 0 || $source === '') {
    fwrite(STDERR, "Usage: php bin/import_keys.php <offer id> <file | ->\n");
    exit(2);
}

/** @var PDO $pdo */
$pdo = $container->get(PDO::class);
$cipher = $container->get(KeyCipher::class);

$offer = $pdo->prepare('SELECT 1 FROM offers WHERE id = ?');
$offer->execute([$offerId]);
if ($offer->fetchColumn() === false) {
    fwrite(STDERR, "No offer with id $offerId.\n");
    exit(1);
}
$sample = $pdo->query('SELECT key_enc FROM game_keys ORDER BY id LIMIT 1')->fetchColumn();
if ($sample !== false) {
    try {
        $cipher->decrypt((string) $sample);
    } catch (Throwable) {
        fwrite(STDERR, "The existing keys cannot be decrypted with the current KEY_ENCRYPTION_KEY: refusing to mix keys under two secrets.\n");
        exit(1);
    }
}

$raw = $source === '-' ? stream_get_contents(STDIN) : @file_get_contents($source);
if ($raw === false) {
    fwrite(STDERR, "Cannot read $source.\n");
    exit(1);
}
$keys = [];
foreach (preg_split('/\R/', $raw) ?: [] as $line) {
    $key = trim($line);
    if ($key === '') {
        continue;
    }
    if (strlen($key) > 150 || preg_match('/^[\x21-\x7E ]+$/', $key) !== 1) {
        fwrite(STDERR, "A line is not a plain printable key (max 150 characters): nothing imported.\n");
        exit(1);
    }
    $keys[$key] = true;
}

$insert = $pdo->prepare('INSERT IGNORE INTO game_keys (offer_id, key_enc, key_hash) VALUES (?, ?, ?)');
$added = 0;
$pdo->beginTransaction();
try {
    foreach (array_keys($keys) as $key) {
        $insert->execute([$offerId, $cipher->encrypt($key), KeyCipher::fingerprint($key)]);
        $added += $insert->rowCount();
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}
printf("Offer %d: %d key(s) added, %d already known (skipped).\n", $offerId, $added, count($keys) - $added);
