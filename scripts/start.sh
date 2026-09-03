#!/bin/bash
# Launch backend (server/) and frontend (client/) together, one shot.
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

SERVER_PID=""
CLIENT_PID=""
CLEANUP_DONE=0

cleanup() {
    [ "$CLEANUP_DONE" = 1 ] && return
    CLEANUP_DONE=1
    echo ""
    echo "Shutting down..."
    [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
    [ -n "$CLIENT_PID" ] && kill "$CLIENT_PID" 2>/dev/null
    wait "$SERVER_PID" "$CLIENT_PID" 2>/dev/null
}
trap cleanup INT TERM EXIT

echo "Starting backend (server/)..."
# exec replaces the subshell with node itself, so SERVER_PID is the real
# process (npm start would fork node as a child npm's own PID can't kill).
(cd "$ROOT/server" && exec node index.js) &
SERVER_PID=$!

echo "Starting frontend (client/)..."
(cd "$ROOT/client" && exec npx vite) &
CLIENT_PID=$!

sleep 2
echo ""
echo "Backend PID: $SERVER_PID"
echo "Frontend PID: $CLIENT_PID"
echo "Frontend URL: http://localhost:5173"
echo "Press Ctrl+C to stop both."
echo ""

wait "$SERVER_PID" "$CLIENT_PID"
