<?php

declare(strict_types=1);

namespace Tests;

use App\Support\Database;
use PDO;
use PHPUnit\Framework\TestCase;

final class DatabaseTlsTest extends TestCase
{
    public function testWithoutDbSslNothingChanges(): void
    {
        self::assertSame([], Database::tlsOptions(['ssl' => false, 'ssl_ca' => '/x.pem']));
        self::assertSame([], Database::tlsOptions([]));
    }

    public function testDbSslVerifiesAgainstTheSystemBundleByDefault(): void
    {
        $options = Database::tlsOptions(['ssl' => true, 'ssl_ca' => '', 'ssl_verify' => true]);

        self::assertSame('/etc/ssl/certs/ca-certificates.crt', $options[PDO::MYSQL_ATTR_SSL_CA]);
        self::assertTrue($options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT]);
    }

    public function testAHostSpecificCaFileAndTheVerifyOptOutAreHonoured(): void
    {
        $options = Database::tlsOptions(['ssl' => true, 'ssl_ca' => '/etc/secrets/ca.pem', 'ssl_verify' => false]);

        self::assertSame('/etc/secrets/ca.pem', $options[PDO::MYSQL_ATTR_SSL_CA]);
        self::assertFalse($options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT]);
    }
}
