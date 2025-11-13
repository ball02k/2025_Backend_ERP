#!/bin/bash

# Test Tender Workflow - Quick Reference Guide
# This script demonstrates how to test the tender invitation flow

echo "🔍 TENDER WORKFLOW TEST GUIDE"
echo "======================================"
echo ""

# Step 1: Check what data we have
echo "📊 Step 1: Check existing data"
echo "------------------------------"
echo "Suppliers count:"
PGPASSWORD=postgres psql -h localhost -U postgres -d erp_dev -t -c "SELECT COUNT(*) FROM \"Supplier\" WHERE \"tenantId\" = 'demo';"

echo ""
echo "Tenders count:"
PGPASSWORD=postgres psql -h localhost -U postgres -d erp_dev -t -c "SELECT COUNT(*) FROM \"Tender\" WHERE \"tenantId\" = 'demo';"

echo ""
echo "Sample Tender (if exists):"
PGPASSWORD=postgres psql -h localhost -U postgres -d erp_dev -c "SELECT id, \"projectId\", \"packageId\", title, status FROM \"Tender\" WHERE \"tenantId\" = 'demo' LIMIT 1;"

echo ""
echo ""
echo "📝 Step 2: Test Quick Invite API"
echo "------------------------------"
echo "To test the quick invite endpoint, use this curl command:"
echo ""
echo "curl -X POST http://localhost:3001/api/tenders/{TENDER_ID}/quick-invite \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -d '{"
echo "    \"email\": \"john.smith@newcompany.com\","
echo "    \"name\": \"NewCo Construction Ltd\","
echo "    \"contactName\": \"John Smith\","
echo "    \"phone\": \"+44 20 1234 5678\","
echo "    \"trade\": \"Groundworks\""
echo "  }'"

echo ""
echo ""
echo "📊 Step 3: Check Tender Invitations"
echo "------------------------------"
echo "Recent invitations:"
PGPASSWORD=postgres psql -h localhost -U postgres -d erp_dev -c "SELECT ti.id, ti.\"requestId\" as tender_id, s.name as supplier, ti.status, ti.\"invitedAt\" FROM \"TenderInvitation\" ti JOIN \"Supplier\" s ON s.id = ti.\"supplierId\" WHERE ti.\"tenantId\" = 'demo' ORDER BY ti.\"invitedAt\" DESC LIMIT 5;"

echo ""
echo ""
echo "🎯 Step 4: API Endpoints Available"
echo "------------------------------"
echo "GET    /api/suppliers                          - List all suppliers"
echo "GET    /api/tenders/:id/invitations            - List tender invitations"
echo "POST   /api/tenders/:id/invitations            - Invite existing suppliers (bulk)"
echo "POST   /api/tenders/:id/quick-invite           - Quick invite by email (creates if needed)"
echo "DELETE /api/tenders/:id/invitations/:invId     - Cancel invitation"
echo ""

echo ""
echo "✅ Next Steps:"
echo "------------------------------"
echo "1. Get a valid JWT token by logging in: POST /api/auth/login"
echo "2. Find or create a tender ID from the database"
echo "3. Use the quick-invite endpoint to add suppliers by email"
echo "4. Check the TenderInvitation table to see the results"
echo ""
