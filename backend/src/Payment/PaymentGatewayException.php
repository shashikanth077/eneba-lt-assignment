<?php

declare(strict_types=1);

namespace App\Payment;

use RuntimeException;

/** The payment provider could not do what we asked (network, bad key, declined request...). */
final class PaymentGatewayException extends RuntimeException
{
}
