#!/usr/bin/env bash
set -euo pipefail

echo "== Squash Prisma migrations into a clean baseline =="

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -d "prisma" ] || [ ! -f "prisma/schema.prisma" ]; then
  echo "Error: prisma/schema.prisma not found"
  exit 1
fi

# 1) Backup existing migrations
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
mkdir -p "prisma/_migrations_backup/$STAMP"
if [ -d "prisma/migrations" ]; then
  cp -R prisma/migrations "prisma/_migrations_backup/$STAMP/"
fi

# 2) Remove current migrations (we’ll recreate a clean baseline)
rm -rf prisma/migrations
mkdir -p prisma/migrations

# 3) Ensure Prisma client is generated
npx prisma generate

# 4) Create a single baseline migration from the current schema
BASE_DIR="prisma/migrations/00000000000000_init_baseline"
mkdir -p "$BASE_DIR"
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$BASE_DIR/migration.sql"

# 5) Print a quick sanity check for duplicate CREATE TABLE lines (eg. User)
echo "== Checking for duplicate CREATE TABLE statements =="
grep -E "CREATE TABLE .*User" -n "$BASE_DIR/migration.sql" || true

# 6) Reset DB and apply the new baseline
#    This drops and recreates the DB schema and runs the new baseline migration.
npx prisma migrate reset --force

# 7) Reseed dev data (adjust if your script name differs)
if npm run | grep -q "dev-seed"; then
  npm run dev-seed || true
elif npm run | grep -q "seed:dev"; then
  npm run seed:dev || true
elif npm run | grep -q "seed"; then
  npm run seed || true
fi

echo "== Prisma squash complete =="

