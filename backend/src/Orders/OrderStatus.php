<?php

declare(strict_types=1);

namespace App\Orders;

/** Mirrors the orders.status ENUM. */
final class OrderStatus
{
    public const PENDING = 'pending';           // keys reserved, waiting for payment
    public const PAID = 'paid';                 // payment confirmed, keys sold
    public const FAILED = 'failed';             // the payment failed, keys released
    public const EXPIRED = 'expired';           // not paid in time, keys released
    public const CANCELED = 'canceled';         // canceled by the buyer/shop/provider, keys released
    public const REFUND_NEEDED = 'refund_needed'; // paid, but the keys could not be delivered: money must go back
    public const REFUNDED = 'refunded';         // the money went back

    private function __construct()
    {
    }
}
