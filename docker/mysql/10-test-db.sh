#!/bin/sh
# Runs once, on the first start of an empty MySQL volume. PHPUnit integration tests use this database.
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS keymart_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON keymart_test.* TO '$MYSQL_USER'@'%';
SQL
