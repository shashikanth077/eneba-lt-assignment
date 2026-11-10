#!/bin/sh
set -e
# The source folder is bind-mounted in development, so install dependencies on first start.
if [ ! -f vendor/autoload.php ]; then
    composer install --no-interaction --prefer-dist
fi

# Start-up steps for a deployment (docs/DEPLOY.md). Both are OFF unless asked for, so local Docker behaves as before.
#   RUN_MIGRATIONS=true            apply database/migrations/*.sql that have not run yet (safe to repeat)
#   SEED_ON_START=if-empty|always  load the demo catalogue and demo accounts: only when no product exists yet, or on every start
# A free database host may still be waking up when the container starts, so the first connection is retried for about a minute.
if [ "$RUN_MIGRATIONS" = "true" ]; then
    attempt=1
    until php bin/migrate.php; do
        if [ "$attempt" -ge 12 ]; then
            echo "Database still not reachable after $attempt attempts, giving up." >&2
            exit 1
        fi
        echo "Database not ready (attempt $attempt of 12), retrying in 5 s..."
        attempt=$((attempt + 1))
        sleep 5
    done
fi
case "$SEED_ON_START" in
    if-empty) php bin/seed.php --if-empty ;;
    always) php bin/seed.php ;;
    "" | false) ;;
    *) echo "SEED_ON_START must be if-empty, always or false (got '$SEED_ON_START')." >&2; exit 1 ;;
esac

exec "$@"
