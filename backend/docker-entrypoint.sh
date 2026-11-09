#!/bin/sh
set -e
# The source folder is bind-mounted in development, so install dependencies on first start.
if [ ! -f vendor/autoload.php ]; then
    composer install --no-interaction --prefer-dist
fi
exec "$@"
