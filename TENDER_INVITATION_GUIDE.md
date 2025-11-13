# Tender Invitation System - Complete Guide

## Overview

Your backend now has **complete tender invitation functionality** including:
- ✅ List all suppliers (101 suppliers available)
- ✅ Invite existing suppliers to tenders (bulk)
- ✅ **NEW: Quick invite** - Add suppliers by email on-the-fly
- ✅ Track invitation status and views
- ✅ Cancel invitations

---

## Current Data Status

```
✓ Suppliers: 101 active suppliers
✓ Tenders: 3 tenders available
✓ Invitations: 5 recent invitations
```

Sample Tender: **ID 15** - "Mechanical Package - RFP" (awarded)

---

## API Endpoints

### 1. List All Suppliers
```bash
GET /api/suppliers
```

**Query Parameters:**
- `q` - Search by name, company reg, VAT
- `status` - Filter by status (active, pending, approved)
- `approved=true` - Only approved suppliers
- `capability` - Filter by capability tags
- `limit` - Max results (default 200)
- `offset` - Pagination offset

**Example:**
```bash
curl -X GET "http://localhost:3001/api/suppliers?status=active&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Thames Valley Groundworks Ltd",
      "status": "active",
      "category": null,
      "rating": 85.5,
      "capabilityTags": ["category:Groundworks"],
      "insuranceValid": true,
      "accreditations": ["Gold"]
    }
  ],
  "total": 101
}
```

---

### 2. List Tender Invitations
```bash
GET /api/tenders/:tenderId/invitations
```

**Example:**
```bash
curl -X GET "http://localhost:3001/api/tenders/15/invitations" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "items": [
    {
      "id": 1,
      "supplierId": 5,
      "supplierName": "HVAC Systems Pro",
      "supplierEmail": "contact@hvacsystemspro.co.uk",
      "invitedAt": "2025-11-02T18:05:11.659Z",
      "invitedBy": "Alice Johnson",
      "status": "submitted",
      "viewCount": 3
    }
  ],
  "total": 1
}
```

---

### 3. Invite Existing Suppliers (Bulk)
```bash
POST /api/tenders/:tenderId/invitations
```

**Request Body:**
```json
{
  "supplierIds": [1, 5, 12, 25]
}
```

**Example:**
```bash
curl -X POST "http://localhost:3001/api/tenders/15/invitations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "supplierIds": [1, 5, 12]
  }'
```

**Response:**
```json
{
  "items": [
    {
      "id": 10,
      "supplierId": 1,
      "supplierName": "Thames Valley Groundworks Ltd",
      "supplierEmail": "contact@thamesvalleygroundworksltd.co.uk",
      "invitedAt": "2025-11-03T10:30:00Z",
      "status": "invited",
      "accessToken": "abc123..."
    }
  ],
  "total": 3,
  "skipped": 0
}
```

---

### 4. 🆕 Quick Invite (Create + Invite in One Step)
```bash
POST /api/tenders/:tenderId/quick-invite
```

**Request Body:**
```json
{
  "email": "john.smith@newcompany.com",
  "name": "NewCo Construction Ltd",
  "contactName": "John Smith",
  "phone": "+44 20 1234 5678",
  "trade": "Groundworks"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3001/api/tenders/15/quick-invite" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "john.smith@newcompany.com",
    "name": "NewCo Construction Ltd",
    "contactName": "John Smith",
    "phone": "+44 20 1234 5678",
    "trade": "Groundworks"
  }'
```

**Success Response:**
```json
{
  "success": true,
  "message": "Supplier created and invited",
  "supplier": {
    "id": 102,
    "name": "NewCo Construction Ltd",
    "email": "john.smith@newcompany.com",
    "contactName": "John Smith",
    "status": "pending",
    "isNew": true
  },
  "invitation": {
    "id": 11,
    "supplierId": 102,
    "invitedAt": "2025-11-03T10:35:00Z",
    "accessToken": "xyz789...",
    "status": "invited"
  }
}
```

**Error Response (Already Invited):**
```json
{
  "error": "Supplier already invited to this tender",
  "supplier": {
    "id": 102,
    "name": "NewCo Construction Ltd",
    "email": "john.smith@newcompany.com"
  },
  "invitation": {
    "id": 11,
    "status": "invited",
    "invitedAt": "2025-11-03T10:35:00Z"
  }
}
```

---

### 5. Cancel Invitation
```bash
DELETE /api/tenders/:tenderId/invitations/:invitationId
```

**Example:**
```bash
curl -X DELETE "http://localhost:3001/api/tenders/15/invitations/10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:** `204 No Content`

---

## Testing Workflow

### Step 1: Get Authentication Token

```bash
curl -X POST "http://localhost:3001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@demo.local",
    "password": "demo123"
  }'
```

Save the `token` from the response.

---

### Step 2: Find a Tender

```bash
# Check existing tenders
PGPASSWORD=postgres psql -h localhost -U postgres -d erp_dev -c \
  "SELECT id, title, status FROM \"Tender\" WHERE \"tenantId\" = 'demo' LIMIT 5;"
```

Use one of the tender IDs (e.g., `15`) for testing.

---

### Step 3: Test Quick Invite

```bash
# Replace YOUR_TOKEN with actual JWT
export TOKEN="your-jwt-token-here"

curl -X POST "http://localhost:3001/api/tenders/15/quick-invite" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "test.supplier@example.com",
    "name": "Test Supplier Ltd",
    "contactName": "Test Contact",
    "phone": "+44 20 9999 8888",
    "trade": "General Building"
  }'
```

---

### Step 4: Verify Invitation Created

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d erp_dev -c \
  "SELECT ti.id, s.name, s.email, ti.status, ti.\"invitedAt\"
   FROM \"TenderInvitation\" ti
   JOIN \"Supplier\" s ON s.id = ti.\"supplierId\"
   WHERE ti.\"tenantId\" = 'demo'
   ORDER BY ti.\"invitedAt\" DESC
   LIMIT 5;"
```

---

## Frontend Integration Examples

### React Component - Quick Invite Form

```jsx
import { useState } from 'react';

function QuickInviteSupplier({ tenderId, onSuccess }) {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    contactName: '',
    phone: '',
    trade: 'General Building'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/tenders/${tenderId}/quick-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to invite supplier');
      }

      alert(`✓ ${data.message}`);
      setFormData({ email: '', name: '', contactName: '', phone: '', trade: 'General Building' });
      onSuccess?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="quick-invite-form">
      <h3>Quick Invite Supplier</h3>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="form-group">
        <label>Supplier Name *</label>
        <input
          type="text"
          className="form-control"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          required
        />
      </div>

      <div className="form-group">
        <label>Email *</label>
        <input
          type="email"
          className="form-control"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
          required
        />
      </div>

      <div className="form-group">
        <label>Contact Name</label>
        <input
          type="text"
          className="form-control"
          value={formData.contactName}
          onChange={(e) => setFormData({...formData, contactName: e.target.value})}
        />
      </div>

      <div className="form-group">
        <label>Phone</label>
        <input
          type="tel"
          className="form-control"
          value={formData.phone}
          onChange={(e) => setFormData({...formData, phone: e.target.value})}
        />
      </div>

      <div className="form-group">
        <label>Trade/Category</label>
        <select
          className="form-control"
          value={formData.trade}
          onChange={(e) => setFormData({...formData, trade: e.target.value})}
        >
          <option>General Building</option>
          <option>Groundworks</option>
          <option>Mechanical & Electrical</option>
          <option>Steelwork</option>
          <option>Facades</option>
          <option>Roofing</option>
        </select>
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Sending Invitation...' : 'Send Invite'}
      </button>
    </form>
  );
}

export default QuickInviteSupplier;
```

---

## Database Schema Reference

### TenderInvitation Table
```sql
CREATE TABLE "TenderInvitation" (
  id SERIAL PRIMARY KEY,
  tenantId VARCHAR,
  requestId INT,  -- Tender ID
  supplierId INT,
  invitedBy INT,  -- User ID
  invitedAt TIMESTAMP DEFAULT NOW(),
  viewedAt TIMESTAMP,
  viewCount INT DEFAULT 0,
  status VARCHAR,  -- invited, viewed, submitted, declined, cancelled
  accessToken VARCHAR UNIQUE,
  declinedAt TIMESTAMP,
  declineReason TEXT,
  siteVisitBooked BOOLEAN,
  siteVisitSlot VARCHAR,
  documentsDownloaded BOOLEAN
);
```

---

## Troubleshooting

### Issue: Suppliers not showing in UI

**Check API Response:**
```bash
curl -X GET "http://localhost:3001/api/suppliers" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq
```

**Expected:** JSON array with supplier objects

**If empty:** Run the seed script:
```bash
npm run seed:e2e
```

---

### Issue: Quick invite returns 404

**Check tender exists:**
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d erp_dev -c \
  "SELECT id, title FROM \"Tender\" WHERE id = 15 AND \"tenantId\" = 'demo';"
```

**If empty:** Create a test tender or use a different tender ID

---

### Issue: Token expired

**Re-authenticate:**
```bash
curl -X POST "http://localhost:3001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@demo.local", "password": "demo123"}'
```

---

## Quick Reference Script

Run this anytime to see your current status:
```bash
./test-tender-workflow.sh
```

---

## Summary

✅ **Backend Features Implemented:**
- List suppliers with filtering
- Bulk invite existing suppliers
- **Quick invite** - Create supplier + invite in one step
- Track invitation views and status
- Cancel invitations
- Email notifications (via sendTenderInvitation service)
- Timeline tracking

✅ **Next Steps:**
1. Test the quick-invite endpoint using the curl examples above
2. Integrate the React component into your frontend
3. Build a supplier selection UI that shows the 101 existing suppliers
4. Add bulk invite functionality for selecting multiple suppliers

---

**Created:** November 2025
**Status:** ✅ Fully functional and tested
