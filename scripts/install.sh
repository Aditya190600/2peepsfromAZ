#!/bin/bash
# One-shot setup: install deps, prep .env. No database - checks are plain code modules.
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "== Checking required tools =="

if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required but not installed. Install Node.js and re-run." >&2
    exit 1
fi

echo "node: $(node --version)"

echo ""
echo "== Preparing .env =="

if [ ! -f "$ROOT/.env" ]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    echo "Created .env from .env.example."
    echo "IMPORTANT: set ASSEMBLYAI_API_KEY in .env before running scripts/start.sh."
else
    echo ".env already exists, leaving as-is."
fi

echo ""
echo "== Installing dependencies =="

echo "Installing server dependencies..."
(cd "$ROOT/server" && npm install)

echo "Installing client dependencies..."
(cd "$ROOT/client" && npm install)

echo ""
echo "Install complete. Run ./scripts/start.sh to launch the app."
