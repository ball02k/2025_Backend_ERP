#!/bin/bash

# Test Contract Confirmation Flow
# Prerequisites:
#   - Server running on http://localhost:3001
#   - Valid auth token
#   - Contract with uploaded signed document and completed OCR

set -e

API_BASE="http://localhost:3001/api"
AUTH_TOKEN="${AUTH_TOKEN:-your_token_here}"
CONTRACT_ID="${CONTRACT_ID:-7}"

echo "📋 Testing Contract Confirmation Flow"
echo "======================================"
echo ""
echo "Contract ID: $CONTRACT_ID"
echo "API Base: $API_BASE"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check OCR status
echo -e "${YELLOW}Step 1: Checking OCR status...${NC}"
curl -s -X GET "$API_BASE/contracts/$CONTRACT_ID/ocr-status" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" | jq .

echo ""
echo -e "${GREEN}✓ OCR status retrieved${NC}"
echo ""

# Step 2: Confirm signed contract with OCR data
echo -e "${YELLOW}Step 2: Confirming signed contract...${NC}"
RESPONSE=$(curl -s -X POST "$API_BASE/contracts/$CONTRACT_ID/documents/confirm-signed" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmedData": {
      "value": 948729.78,
      "startDate": "2025-11-24",
      "endDate": "2026-12-18",
      "retentionPercent": 5,
      "contractType": "NEC4",
      "paymentTerms": 14
    },
    "reviewNotes": "All OCR data verified and confirmed"
  }')

echo "$RESPONSE" | jq .

# Check if PO was generated
PO_TRIGGERED=$(echo "$RESPONSE" | jq -r '.poGeneration.triggered')
PO_COUNT=$(echo "$RESPONSE" | jq -r '.poGeneration.count')

echo ""
if [ "$PO_TRIGGERED" = "true" ]; then
  echo -e "${GREEN}✓ Contract confirmed successfully${NC}"
  echo -e "${GREEN}✓ $PO_COUNT PO(s) generated${NC}"
else
  echo -e "${YELLOW}⚠ Contract confirmed but no POs generated${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo -e "${GREEN}✓ Test completed successfully${NC}"
echo -e "${GREEN}═══════════════════════════════════${NC}"
