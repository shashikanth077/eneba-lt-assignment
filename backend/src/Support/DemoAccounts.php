<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The public demo accounts created by the seeder (docs/EMAIL.md). They hold no money and no real keys, are listed in the README, and are shared
 * by every reviewer: their password cannot be changed, otherwise the first visitor would lock everybody else out.
 */
final class DemoAccounts
{
    /** @var list<array{0: string, 1: string, 2: string}> [email, display name, password] */
    public const ALL = [
        ['demo.buyer@keymart.test', 'Demo Buyer', 'Demo-Buyer-2027'],
        ['demo.shopper@keymart.test', 'Demo Shopper', 'Demo-Shopper-2027'],
    ];

    public static function isDemo(string $email): bool
    {
        foreach (self::ALL as [$demoEmail]) {
            if (strcasecmp($demoEmail, $email) === 0) {
                return true;
            }
        }

        return false;
    }
}
