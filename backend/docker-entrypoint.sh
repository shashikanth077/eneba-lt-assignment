#!/bin/sh
set -e
# The source folder is bind-mounted in development, so install dependencies on first start.
if [ ! -f vendor/autoload.php ]; then
    composer install --no-interaction --prefer-dist
fi

# Start-up steps (docs/DEPLOY.md). Both are ON by default and both are safe to repeat:
#   RUN_MIGRATIONS (default true)       apply database/migrations/*.sql that have not run yet
#   SEED_ON_START  (default if-empty)   if-empty: load the demo catalogue and game keys when no game key exists yet (also completes a
#                                       database imported from railway_import.sql); always: run the idempotent seeder every start; false: never
# Without game keys every offer is "out of stock", which is why seeding is the default. Set either variable to false to opt out.
# A free database host may still be waking up, so the first connection is retried for about a minute. If the database stays
# unreachable the container still starts (with a warning), so /api/health can report it, unless RUN_MIGRATIONS was set explicitly.
RUN_MIGRATIONS_EXPLICIT="${RUN_MIGRATIONS:+yes}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
SEED_ON_START="${SEED_ON_START-if-empty}"

DB_READY=yes
if [ "$RUN_MIGRATIONS" = "true" ]; then
    attempt=1
    until php bin/migrate.php; do
        if [ "$attempt" -ge 12 ]; then
            echo "Database still not reachable after $attempt attempts." >&2
            if [ -n "$RUN_MIGRATIONS_EXPLICIT" ]; then
                exit 1
            fi
            echo "WARNING: starting without migrating or seeding; fix DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS (see GET /api/health)." >&2
            DB_READY=no
            break
        fi
        echo "Database not ready (attempt $attempt of 12), retrying in 5 s..."
        attempt=$((attempt + 1))
        sleep 5
    done
fi
if [ "$DB_READY" = "yes" ]; then
    case "$SEED_ON_START" in
        if-empty) php bin/seed.php --if-empty ;;
        always) php bin/seed.php ;;
        "" | false) ;;
        *) echo "SEED_ON_START must be if-empty, always or false (got '$SEED_ON_START')." >&2; exit 1 ;;
    esac
fi

exec "$@"
