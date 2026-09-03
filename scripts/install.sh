#!/bin/bash
# One-shot setup: install deps, create + seed the database, prep .env.
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

DB_NAME="complyline"
DEFAULT_DATABASE_URL="postgres://localhost:5432/$DB_NAME"

echo "== Checking required tools =="

if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required but not installed. Install Node.js and re-run." >&2
    exit 1
fi

if command -v createdb >/dev/null 2>&1; then
    PG_METHOD="createdb"
elif command -v psql >/dev/null 2>&1; then
    PG_METHOD="psql"
else
    echo "Error: neither 'createdb' nor 'psql' found. Install PostgreSQL client tools and re-run." >&2
    exit 1
fi

echo "node: $(node --version)"
echo "postgres client: $PG_METHOD"

echo ""
echo "== Preparing .env =="

if [ ! -f "$ROOT/.env" ]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    echo "Created .env from .env.example."
    echo "IMPORTANT: set ASSEMBLYAI_API_KEY in .env before running scripts/start.sh."
else
    echo ".env already exists, leaving as-is."
fi

# .env is sourced (not exported) for DATABASE_URL, so seed.js/psql/createdb agree.
if [ -f "$ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
fi
DATABASE_URL="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"

echo ""
echo "== Installing dependencies =="

echo "Installing server dependencies..."
(cd "$ROOT/server" && npm install)

echo "Installing client dependencies..."
(cd "$ROOT/client" && npm install)

echo ""
echo "== Creating database (idempotent) =="

if [ "$PG_METHOD" = "createdb" ]; then
    if createdb "$DB_NAME" 2>/dev/null; then
        echo "Created database '$DB_NAME'."
    else
        echo "Database '$DB_NAME' already exists (or createdb failed non-fatally), continuing."
    fi
else
    EXISTS=$(psql -tA -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" postgres 2>/dev/null || true)
    if [ "$EXISTS" = "1" ]; then
        echo "Database '$DB_NAME' already exists, skipping."
    else
        psql -c "CREATE DATABASE \"$DB_NAME\";" postgres
        echo "Created database '$DB_NAME'."
    fi
fi

echo ""
echo "== Seeding database =="

(cd "$ROOT/server" && node seed.js)

echo ""
echo "Install complete. Run ./scripts/start.sh to launch the app."
