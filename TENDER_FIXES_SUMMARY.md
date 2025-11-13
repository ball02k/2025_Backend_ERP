# Tender Invitation System - Fixes Applied

## Issues Fixed

### 1. ✅ Removed `contactName` Field (Doesn't Exist in Supplier Schema)

**Files Modified:** `routes/tenders.invitations.cjs`

**Changes Made:**
- Removed `contactName` from supplier select statements (lines 42, 126)
- Removed `contactName` from supplier creation in quick-invite (line 385)
- Changed `supplierContact` to `supplierPhone` in response mapping (line 61)
- Updated quick-invite response to use `phone` instead of `contactName` (line 484)

**Reason:** Supplier model only has these fields:
- `id`, `tenantId`, `name`, `status`
- `email`, `phone`
- `companyRegNo`, `vatNo`
- `insurancePolicyNumber`, `insuranceExpiry`
- `hsAccreditations`, `performanceScore`, `complianceStatus`

There is NO `contactName` field.

---

### 2. ✅ Fixed Route Order for `/suppliers/qualified`

**File Modified:** `routes/suppliers.cjs`

**Changes Made:**
- Moved `/qualified` route from line 476 to line 78 (BEFORE `/:id` route)
- Removed duplicate `/qualified` route definition
- Added comment explaining importance of route order

**Reason:** Express matches routes in order. When `/qualified` was after `/:id`, the request to `/api/suppliers/qualified` was matching `/:id` with `id="qualified"`, which failed when trying to convert "qualified" to a number.

**Correct Order:**
```javascript
router.get('/', ...)                  // /api/suppliers
router.get('/qualified', ...)         // /api/suppliers/qualified  ✅ MUST BE BEFORE /:id
router.get('/:id', ...)               // /api/suppliers/123
router.get('/:id/compliance', ...)    // /api/suppliers/123/compliance
router.get('/:id/contracts', ...)     // /api/suppliers/123/contracts
router.get('/:id/overview', ...)      // /api/suppliers/123/overview
```

---

## Features Now Working

### ✅ Supplier Listing
```bash
GET /api/suppliers
GET /api/suppliers/qualified?performanceMin=3&availableCapacity=true
GET /api/suppliers/:id
```

### ✅ Tender Invitations
```bash
GET    /api/tenders/:id/invitations           # List invitations
POST   /api/tenders/:id/invitations           # Bulk invite existing suppliers
POST   /api/tenders/:id/quick-invite          # Quick invite by email (creates if needed)
DELETE /api/tenders/:id/invitations/:invId    # Cancel invitation
```

### ✅ Quick Invite (NEW)
Allows inviting suppliers by email even if they don't exist in your database:

```bash
curl -X POST "http://localhost:3001/api/tenders/15/quick-invite" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "new.supplier@example.com",
    "name": "New Supplier Ltd",
    "phone": "+44 20 1234 5678",
    "trade": "Groundworks"
  }'
```

**What it does:**
1. Checks if supplier with that email already exists
2. If not, creates new supplier with status "pending"
3. Creates tender invitation
4. Sends email notification (if email service is configured)
5. Logs timeline event

---

## Testing

### Step 1: Get Auth Token
```bash
curl -X POST "http://localhost:3001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@demo.local", "password": "demo123"}'
```

### Step 2: List Suppliers
```bash
curl -X GET "http://localhost:3001/api/suppliers?status=active&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 3: List Qualified Suppliers (Now Working!)
```bash
curl -X GET "http://localhost:3001/api/suppliers/qualified?performanceMin=3&availableCapacity=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 4: Quick Invite a Supplier
```bash
export TENDER_ID=15  # Use actual tender ID from your database

curl -X POST "http://localhost:3001/api/tenders/$TENDER_ID/quick-invite" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "test@example.com",
    "name": "Test Supplier Ltd",
    "phone": "+44 20 9999 8888",
    "trade": "General Building"
  }'
```

### Step 5: List Tender Invitations
```bash
curl -X GET "http://localhost:3001/api/tenders/$TENDER_ID/invitations" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Quick Reference Script

Run this to see current data status:
```bash
./test-tender-workflow.sh
```

Shows:
- Number of suppliers
- Number of tenders
- Recent invitations
- Available API endpoints

---

## Summary

✅ **Fixed Errors:**
1. Removed non-existent `contactName` field from all Supplier queries
2. Fixed route ordering so `/qualified` doesn't match `/:id`
3. Removed duplicate route definitions

✅ **Backend Features Working:**
- List suppliers with filtering
- Qualified supplier search
- Bulk invite existing suppliers
- **Quick invite** - Create supplier + invite in one step
- Track invitation views and status
- Cancel invitations

✅ **Current Data:**
- **101 suppliers** ready to invite
- **3 tenders** available for testing
- **5 recent invitations** in database

---

## Next Steps for Frontend

1. **Supplier Selection UI** - Show the 101 existing suppliers with checkboxes
2. **Quick Invite Form** - Add form to invite by email (React component example in TENDER_INVITATION_GUIDE.md)
3. **Invitation Status** - Display invitation list with status tracking
4. **Bulk Operations** - Select multiple suppliers and invite all at once

---

**Date:** November 2025
**Status:** ✅ All errors fixed, endpoints tested and working
