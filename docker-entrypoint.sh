#!/bin/sh
# Solvio — entrypoint kontenera.
# Przed startem serwera synchronizuje schemat bazy (tworzy/aktualizuje tabele)
# przez drizzle-kit push. Idempotentne — na istniejącej bazie nic nie psuje.
# Wyłączenie: SKIP_DB_PUSH=1
set -e

if [ "$SKIP_DB_PUSH" != "1" ] && [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Syncing database schema (drizzle-kit push)…"
  if (cd /migrate && ./node_modules/.bin/drizzle-kit push --force); then
    echo "[entrypoint] ✅ Schema in sync"
  else
    echo "[entrypoint] ⚠️  Schema push failed — starting anyway (check DATABASE_URL / DB availability)"
  fi
fi

exec node /app/server.js
