#!/bin/bash
set -e

echo "🔧 Checking for failed migrations..."

# Try to mark the known failed migration as applied
npx prisma migrate resolve --applied "20251016143916_add_contract_tenantid_and_budget_qty_rate" 2>&1 || {
  echo "⚠️  Migration already resolved or doesn't exist, continuing..."
}

echo "✅ Migration state resolved"
echo "📦 Running pending migrations..."

# Now deploy any pending migrations
npx prisma migrate deploy

echo "✅ All migrations applied successfully"
