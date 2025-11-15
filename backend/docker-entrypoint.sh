#!/bin/sh
set -eu

if [ "${SKIP_DB_MIGRATE:-}" = "1" ]; then
  echo "[entrypoint] Skipping database migrations (SKIP_DB_MIGRATE=1)"
else
  echo "[entrypoint] Applying database migrations"
  ALLOW_DB_MIGRATE_FALLBACK=0 node dist/scripts/run-migrate.js
fi

exec "$@"

