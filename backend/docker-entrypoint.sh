#!/bin/sh
# Applies pending migrations, then materializes the platform-minted logins,
# then hands off to the API. A failed migration exits non-zero so Kubernetes
# never routes traffic to a pod running against the wrong schema.
set -e

echo "[entrypoint] applying migrations"
npx prisma migrate deploy

# The seed is a no-op unless Colossus injected COLOSSUS_ACCOUNTS_JSON. A seed
# failure must not wedge the pod: without it the API still serves, it just has
# no platform logins yet.
if [ -n "${COLOSSUS_ACCOUNTS_JSON:-}" ]; then
  echo "[entrypoint] seeding platform accounts"
  node prisma/seed/seed.js || echo "[entrypoint] seed failed (non-fatal); continuing"
else
  echo "[entrypoint] COLOSSUS_ACCOUNTS_JSON not set; skipping account seed"
fi

echo "[entrypoint] starting API"
exec "$@"
