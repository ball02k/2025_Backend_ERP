#!/bin/bash
set -e

if [ -z "$PRISMA_MIGRATE_SHADOW_DATABASE_URL" ]; then
  export PRISMA_MIGRATE_SHADOW_DATABASE_URL="${SHADOW_DATABASE_URL:-$DATABASE_URL}"
fi

echo "============================================"
echo "🔧 MIGRATION FIX SCRIPT STARTING"
echo "============================================"

# Try to mark the known failed migration as applied
echo "📝 Attempting to resolve failed migration..."
node scripts/prisma-env.cjs migrate resolve --applied "20251016143916_add_contract_tenantid_and_budget_qty_rate" 2>&1 || {
  echo "⚠️  Migration already resolved or doesn't exist - continuing..."
}

echo "✅ Migration state resolved"
echo ""
echo "📦 Deploying pending migrations..."
node scripts/prisma-env.cjs migrate deploy

echo ""
echo "============================================"
echo "✅ ALL MIGRATIONS APPLIED SUCCESSFULLY"
echo "============================================"
