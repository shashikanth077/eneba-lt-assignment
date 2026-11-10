<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

/**
 * Encrypts game keys at rest with libsodium secretbox (XSalsa20-Poly1305).
 * Stored form: base64(nonce . ciphertext). A DB dump alone cannot reveal sellable keys.
 */
final class KeyCipher
{
    private function __construct(private readonly string $key)
    {
    }

    /** @param string $base64Key base64 of 32 random bytes: php -r 'echo base64_encode(random_bytes(32));' */
    public static function fromBase64(string $base64Key): self
    {
        $key = base64_decode($base64Key, true);
        if ($key === false || strlen($key) !== \SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
            throw new RuntimeException('KEY_ENCRYPTION_KEY must be base64 of exactly 32 bytes');
        }

        return new self($key);
    }

    public function encrypt(string $plain): string
    {
        $nonce = random_bytes(\SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);

        return base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, $this->key));
    }

    public function decrypt(string $payload): string
    {
        $raw = base64_decode($payload, true);
        if ($raw === false || strlen($raw) <= \SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            throw new RuntimeException('Malformed encrypted key');
        }
        $plain = sodium_crypto_secretbox_open(
            substr($raw, \SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            substr($raw, 0, \SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            $this->key,
        );
        if ($plain === false) {
            throw new RuntimeException('Could not decrypt key (wrong KEY_ENCRYPTION_KEY or corrupted data)');
        }

        return $plain;
    }

    /** Deterministic fingerprint, used to detect duplicates without decrypting. */
    public static function fingerprint(string $plain): string
    {
        return hash('sha256', $plain);
    }
}
