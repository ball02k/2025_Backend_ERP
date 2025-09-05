#!/usr/bin/env bash
set -euo pipefail

# Dev launcher: DB + Backend + Frontend
# - Starts Postgres via docker compose
# - Deploys Prisma schema and seeds demo data
# - Starts API on :3001 (or next free port)
# - Starts Vite on :5173 (proxied to API via /api)

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

backend_dir="$root"
frontend_dir="$(cd "$root/.." && pwd)/2025_ERP"

if [[ ! -d "$frontend_dir" ]]; then
  echo "\n❌ Frontend not found at: $frontend_dir"
  echo "   Expected sibling folder named '2025_ERP' next to backend repo."
  exit 1
fi

echo "\n▶️  Bringing up Postgres (docker compose)"
(cd "$backend_dir" && npm run -s db:up)

echo "\n⏳ Waiting for DB to be ready..."
# Give Postgres a moment; docker healthcheck keeps retrying as needed
sleep 3

echo "\n🧰 Prisma generate + deploy"
(cd "$backend_dir" && npm run -s prisma:generate && npm run -s prisma:deploy)

echo "\n🌱 Seeding demo data (idempotent)"
(cd "$backend_dir" && npm run -s seed:demo || true)

echo "\n🚀 Starting API server (backend)"
(
  cd "$backend_dir"
  # Respect existing PORT from .env; default 3001
  PORT="${PORT:-${PORT:-3001}}" npm run -s dev
) &
api_pid=$!

cleanup() {
  echo "\n🛑 Shutting down dev servers..."
  if kill -0 "$api_pid" 2>/dev/null; then kill "$api_pid" 2>/dev/null || true; fi
  exit 0
}
trap cleanup INT TERM EXIT

# Wait for API health
echo "\n🔎 Waiting for API health at http://localhost:3001/health ..."
for i in {1..50}; do
  if curl -fsS "http://localhost:${PORT:-3001}/health" >/dev/null 2>&1; then
    echo "✅ API is up"
    break
  fi
  sleep 0.2
done

echo "\n⚡ Starting Frontend (Vite)"
(
  cd "$frontend_dir"
  # Ensure expected dev env vars exist (safe if already present)
  if [[ ! -f .env.development ]]; then
    echo "VITE_API_BASE_URL=/api" > .env.development
    echo "VITE_ENABLE_DEV_AUTH=1" >> .env.development
  fi
  npm run -s dev
)

# Foreground waits on Vite; trap handles cleanup

