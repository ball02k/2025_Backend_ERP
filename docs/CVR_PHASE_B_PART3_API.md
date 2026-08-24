# CVR Phase B - Part 3: API Endpoints (COMPLETE)

## 🎯 Objective

Expose CVR forecast functionality through REST API endpoints for frontend integration and external consumers.

## ✅ API Endpoints Implemented

### Summary Table

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/budgetlines/:id/forecast` | Get forecast details for a budget line |
| PATCH | `/api/budgetlines/:id/forecast` | Update forecast for a budget line |
| GET | `/api/budgetlines/:id/forecast/history` | Get forecast change history |
| GET | `/api/budgetlines/:id/forecast/breakdown` | Get detailed forecast breakdown |
| GET | `/api/projects/:id/forecast` | Get project-level forecast summary |
| POST | `/api/projects/:id/forecast/recalculate` | Recalculate all forecasts for a project |
| POST | `/api/projects/:id/forecast/review` | Mark project forecast as reviewed |

---

## 📡 Budget Line Forecast Endpoints

### 1. GET /api/budgetlines/:id/forecast

Get forecast details for a specific budget line.

**URL:** `/api/budgetlines/:id/forecast`

**Method:** `GET`

**Auth Required:** Yes

**URL Parameters:**
- `id` (number) - Budget line ID

**Success Response:**
```json
{
  "ok": true,
  "budgetLine": {
    "id": 479,
    "code": "2.4.1",
    "description": "Ceiling systems - A40 Viaduct Strengthen",
    "originalValue": 50000,
    "currentValue": 50000,
    "committed": 45000,
    "actual": 15000,

    "forecastMethod": "COMMITTED_PLUS_ADJ",
    "forecastFinalCost": 52000,
    "forecastVariance": 2000,
    "forecastAdjustment": 5000,
    "forecastAdjustmentNotes": "Anticipated price increase",
    "anticipatedVariations": 2000,
    "riskAllowance": 1000,
    "forecastStatus": "AT_RISK",
    "costToComplete": 37000,
    "forecastUpdatedBy": "john.doe@example.com",
    "lastForecastUpdated": "2025-12-08T15:01:31.000Z"
  }
}
```

**Error Response:**
```json
{
  "error": "Budget line not found"
}
```

**curl Example:**
```bash
curl -X GET http://localhost:3001/api/budgetlines/479/forecast \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 2. PATCH /api/budgetlines/:id/forecast

Update forecast for a budget line with automatic history tracking.

**URL:** `/api/budgetlines/:id/forecast`

**Method:** `PATCH`

**Auth Required:** Yes

**URL Parameters:**
- `id` (number) - Budget line ID

**Request Body:**
```json
{
  "forecastMethod": "COMMITTED_PLUS_ADJ",
  "forecastAdjustment": 5000,
  "forecastAdjustmentNotes": "Anticipated material price increase based on supplier quote",
  "anticipatedVariations": 2000,
  "riskAllowance": 1000,
  "changeReason": "Monthly forecast review"
}
```

**Body Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `forecastMethod` | enum | No | COMMITTED, MANUAL, COMMITTED_PLUS_ADJ, CALCULATED |
| `forecastAdjustment` | number | No | Manual adjustment amount |
| `forecastAdjustmentNotes` | string | No | Justification for adjustment |
| `anticipatedVariations` | number | No | Variations not yet in committed |
| `riskAllowance` | number | No | Contingency/risk allowance |
| `changeReason` | string | No | Reason for this update |

**Success Response:**
```json
{
  "ok": true,
  "budgetLine": {
    "id": 479,
    "forecastMethod": "COMMITTED_PLUS_ADJ",
    "forecastFinalCost": 52000,
    "forecastVariance": 2000,
    "forecastAdjustment": 5000,
    "forecastStatus": "AT_RISK",
    "costToComplete": 37000,
    "forecastUpdatedBy": "john.doe@example.com",
    "lastForecastUpdated": "2025-12-08T15:10:45.000Z"
  }
}
```

**Notes:**
- Automatically calculates anticipated final cost
- Determines forecast status (ON_TRACK, AT_RISK, OVER_BUDGET, etc.)
- Creates history record if forecast changes
- Recalculates cost to complete

**curl Example:**
```bash
curl -X PATCH http://localhost:3001/api/budgetlines/479/forecast \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "forecastMethod": "COMMITTED_PLUS_ADJ",
    "forecastAdjustment": 5000,
    "forecastAdjustmentNotes": "Anticipated price increase",
    "anticipatedVariations": 2000,
    "riskAllowance": 1000,
    "changeReason": "Monthly forecast review"
  }'
```

---

### 3. GET /api/budgetlines/:id/forecast/history

Get audit trail of forecast changes for a budget line.

**URL:** `/api/budgetlines/:id/forecast/history`

**Method:** `GET`

**Auth Required:** Yes

**URL Parameters:**
- `id` (number) - Budget line ID

**Query Parameters:**
- `limit` (number, optional) - Maximum number of records (default: 50)

**Success Response:**
```json
{
  "ok": true,
  "count": 3,
  "history": [
    {
      "id": "clx123abc",
      "budgetLineId": 479,
      "previousForecast": 45000,
      "newForecast": 52000,
      "changeAmount": 7000,
      "changeReason": "Monthly forecast review",
      "changeType": "MANUAL_ADJUSTMENT",
      "committed": 45000,
      "actual": 15000,
      "createdAt": "2025-12-08T15:10:45.000Z",
      "createdBy": "john.doe@example.com"
    },
    {
      "id": "clx123def",
      "budgetLineId": 479,
      "previousForecast": 43000,
      "newForecast": 45000,
      "changeAmount": 2000,
      "changeReason": "Contract awarded",
      "changeType": "CONTRACT_AWARDED",
      "committed": 45000,
      "actual": 10000,
      "createdAt": "2025-12-01T10:30:00.000Z",
      "createdBy": "pm@example.com"
    }
  ]
}
```

**curl Example:**
```bash
curl -X GET "http://localhost:3001/api/budgetlines/479/forecast/history?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. GET /api/budgetlines/:id/forecast/breakdown

Get detailed breakdown showing how forecast was calculated.

**URL:** `/api/budgetlines/:id/forecast/breakdown`

**Method:** `GET`

**Auth Required:** Yes

**URL Parameters:**
- `id` (number) - Budget line ID

**Success Response:**
```json
{
  "ok": true,
  "breakdown": {
    "budgetLineId": 479,
    "originalBudget": 50000,
    "committed": 45000,
    "actual": 15000,

    "forecastMethod": "COMMITTED_PLUS_ADJ",
    "forecastAdjustment": 5000,
    "anticipatedVariations": 2000,
    "riskAllowance": 1000,

    "anticipatedFinal": 53000,
    "costToComplete": 38000,
    "forecastVariance": 3000,
    "forecastStatus": "AT_RISK",

    "lastUpdated": "2025-12-08T15:10:45.000Z",
    "updatedBy": "john.doe@example.com",
    "notes": "Anticipated material price increase"
  }
}
```

**Use Case:** Display in UI modal showing "How was this forecast calculated?"

**curl Example:**
```bash
curl -X GET http://localhost:3001/api/budgetlines/479/forecast/breakdown \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 Project Forecast Endpoints

### 5. GET /api/projects/:id/forecast

Get project-level forecast summary (aggregated from all budget lines).

**URL:** `/api/projects/:id/forecast`

**Method:** `GET`

**Auth Required:** Yes

**URL Parameters:**
- `id` (number) - Project ID

**Success Response:**
```json
{
  "ok": true,
  "project": {
    "id": 37,
    "name": "A40 Viaduct Strengthening"
  },
  "forecast": {
    "id": "clx123xyz",
    "projectId": 37,
    "tenantId": "demo",

    "totalBudget": 5000000,
    "totalCommitted": 4500000,
    "totalActual": 2000000,
    "totalAnticipatedFinal": 5150000,

    "budgetVariance": -150000,
    "commitmentVariance": -650000,
    "costToComplete": 3150000,

    "totalRiskAllowance": 150000,
    "contingencyRemaining": -150000,

    "overallStatus": "AT_RISK",

    "lastCalculatedAt": "2025-12-08T15:10:45.000Z",
    "lastReviewedAt": "2025-12-01T10:00:00.000Z",
    "lastReviewedBy": "pm@example.com"
  }
}
```

**Field Descriptions:**

| Field | Description |
|-------|-------------|
| `totalBudget` | Sum of all original budget line values |
| `totalCommitted` | Sum of all committed amounts |
| `totalActual` | Sum of all actual costs to date |
| `totalAnticipatedFinal` | Sum of all budget line forecasts |
| `budgetVariance` | Budget - Anticipated (negative = over budget) |
| `commitmentVariance` | Committed - Anticipated |
| `costToComplete` | Total remaining spend (Anticipated - Actual) |
| `totalRiskAllowance` | Sum of risk allowances across all lines |
| `contingencyRemaining` | Same as budgetVariance |
| `overallStatus` | ON_TRACK, AT_RISK, OVER_BUDGET, REQUIRES_REVIEW |

**Notes:**
- Project forecast is auto-calculated from budget lines
- Recalculated automatically if stale (>1 hour)
- Can be manually recalculated via recalculate endpoint

**curl Example:**
```bash
curl -X GET http://localhost:3001/api/projects/37/forecast \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 6. POST /api/projects/:id/forecast/recalculate

Recalculate all budget line forecasts and project-level forecast.

**URL:** `/api/projects/:id/forecast/recalculate`

**Method:** `POST`

**Auth Required:** Yes

**URL Parameters:**
- `id` (number) - Project ID

**Request Body (optional):**
```json
{
  "reason": "Monthly forecast review"
}
```

**Success Response:**
```json
{
  "ok": true,
  "message": "Recalculated 12 of 45 budget lines",
  "totalLines": 45,
  "updatedCount": 12,
  "unchangedCount": 33
}
```

**When To Use:**
- Monthly/quarterly forecast reviews
- After bulk data imports
- After major contract awards
- After budget restructuring

**Notes:**
- Only updates budget lines where forecast changed (≥£0.01)
- Creates history records for changed forecasts
- Recalculates project-level forecast at the end

**curl Example:**
```bash
curl -X POST http://localhost:3001/api/projects/37/forecast/recalculate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Monthly forecast review"}'
```

---

### 7. POST /api/projects/:id/forecast/review

Mark project forecast as reviewed by PM/QS.

**URL:** `/api/projects/:id/forecast/review`

**Method:** `POST`

**Auth Required:** Yes

**URL Parameters:**
- `id` (number) - Project ID

**Request Body (optional):**
```json
{
  "notes": "Reviewed with PM, all forecasts look good"
}
```

**Success Response:**
```json
{
  "ok": true,
  "message": "Forecast marked as reviewed",
  "forecast": {
    "projectId": 37,
    "lastReviewedAt": "2025-12-08T15:15:00.000Z",
    "lastReviewedBy": "john.doe@example.com"
  }
}
```

**curl Example:**
```bash
curl -X POST http://localhost:3001/api/projects/37/forecast/review \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "All forecasts reviewed and approved"}'
```

---

## 🔐 Authentication

All endpoints require authentication via Bearer token:

```bash
-H "Authorization: Bearer YOUR_TOKEN"
```

The token must include:
- `tenantId` - Tenant/organization ID
- `email` or `username` - User identifier

---

## 🧪 Testing the API

### Test Script

A comprehensive curl test script is provided below. Replace `YOUR_TOKEN` with a valid JWT token.

```bash
#!/bin/bash

# CVR Phase B - Part 3 API Test Script

BASE_URL="http://localhost:3001"
TOKEN="YOUR_TOKEN"
PROJECT_ID=37
BUDGET_LINE_ID=479

echo "=== CVR Phase B: API Endpoint Tests ==="
echo ""

# Test 1: Get budget line forecast
echo "Test 1: GET /api/budgetlines/$BUDGET_LINE_ID/forecast"
curl -X GET "$BASE_URL/api/budgetlines/$BUDGET_LINE_ID/forecast" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
echo ""

# Test 2: Update budget line forecast
echo "Test 2: PATCH /api/budgetlines/$BUDGET_LINE_ID/forecast"
curl -X PATCH "$BASE_URL/api/budgetlines/$BUDGET_LINE_ID/forecast" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "forecastMethod": "COMMITTED_PLUS_ADJ",
    "forecastAdjustment": 3000,
    "forecastAdjustmentNotes": "API test - anticipated cost increase",
    "anticipatedVariations": 1500,
    "riskAllowance": 500,
    "changeReason": "API testing"
  }' \
  | jq '.'
echo ""

# Test 3: Get forecast history
echo "Test 3: GET /api/budgetlines/$BUDGET_LINE_ID/forecast/history"
curl -X GET "$BASE_URL/api/budgetlines/$BUDGET_LINE_ID/forecast/history?limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
echo ""

# Test 4: Get forecast breakdown
echo "Test 4: GET /api/budgetlines/$BUDGET_LINE_ID/forecast/breakdown"
curl -X GET "$BASE_URL/api/budgetlines/$BUDGET_LINE_ID/forecast/breakdown" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
echo ""

# Test 5: Get project forecast
echo "Test 5: GET /api/projects/$PROJECT_ID/forecast"
curl -X GET "$BASE_URL/api/projects/$PROJECT_ID/forecast" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
echo ""

# Test 6: Recalculate project forecasts
echo "Test 6: POST /api/projects/$PROJECT_ID/forecast/recalculate"
curl -X POST "$BASE_URL/api/projects/$PROJECT_ID/forecast/recalculate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "API testing"}' \
  | jq '.'
echo ""

# Test 7: Mark forecast as reviewed
echo "Test 7: POST /api/projects/$PROJECT_ID/forecast/review"
curl -X POST "$BASE_URL/api/projects/$PROJECT_ID/forecast/review" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "API test review"}' \
  | jq '.'
echo ""

echo "=== All tests complete ==="
```

**Save as:** `test-forecast-api.sh`

**Run with:**
```bash
chmod +x test-forecast-api.sh
./test-forecast-api.sh
```

---

## 📝 Files Modified

### 1. `/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/routes/budgetlines.forecast.cjs`

**Created:** Complete API routes file (350+ lines)

**Endpoints Implemented:**
- GET `/budgetlines/:id/forecast`
- PATCH `/budgetlines/:id/forecast`
- GET `/budgetlines/:id/forecast/history`
- GET `/budgetlines/:id/forecast/breakdown`
- GET `/projects/:id/forecast`
- POST `/projects/:id/forecast/recalculate`
- POST `/projects/:id/forecast/review`

**Features:**
- Full request validation
- Error handling
- Logging for monitoring
- Authentication required
- Tenant isolation

### 2. `/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/index.cjs`

**Modified:** Lines 110 and 385

**Changes:**
```javascript
// Line 110: Import
const cvrForecastRouter = require('./routes/budgetlines.forecast.cjs');

// Line 385: Registration
app.use('/api', requireAuth, cvrForecastRouter);
```

---

## 🚀 Integration with Frontend

### Example React Hook

```typescript
// useForecast.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';

export function useBudgetLineForecast(budgetLineId: number) {
  return useQuery({
    queryKey: ['budgetLineForecast', budgetLineId],
    queryFn: () => api.get(`/api/budgetlines/${budgetLineId}/forecast`),
  });
}

export function useUpdateBudgetLineForecast(budgetLineId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) =>
      api.patch(`/api/budgetlines/${budgetLineId}/forecast`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['budgetLineForecast', budgetLineId]);
      queryClient.invalidateQueries(['projectForecast']);
    },
  });
}

export function useProjectForecast(projectId: number) {
  return useQuery({
    queryKey: ['projectForecast', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/forecast`),
  });
}
```

### Example Component

```typescript
// ForecastEditor.tsx

function ForecastEditor({ budgetLineId }: { budgetLineId: number }) {
  const { data, isLoading } = useBudgetLineForecast(budgetLineId);
  const updateForecast = useUpdateBudgetLineForecast(budgetLineId);

  const handleSubmit = (values) => {
    updateForecast.mutate({
      forecastMethod: 'COMMITTED_PLUS_ADJ',
      forecastAdjustment: values.adjustment,
      forecastAdjustmentNotes: values.notes,
      changeReason: 'Manual forecast update',
    });
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="number"
        name="adjustment"
        label="Forecast Adjustment"
        defaultValue={data.budgetLine.forecastAdjustment}
      />
      <textarea
        name="notes"
        label="Notes"
        defaultValue={data.budgetLine.forecastAdjustmentNotes}
      />
      <button type="submit">Update Forecast</button>
    </form>
  );
}
```

---

## ⚠️ Important Notes

### Error Handling

All endpoints include comprehensive error handling:

| HTTP Code | Error | Reason |
|-----------|-------|--------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid parameters or malformed body |
| 401 | Unauthorized | Missing or invalid authentication token |
| 404 | Not Found | Budget line, project, or forecast not found |
| 500 | Internal Server Error | Server error (check logs) |

### Logging

All forecast operations are logged:
```
[CVR Phase B] Forecast updated for budget line 479 by john.doe@example.com
[CVR Phase B] Project forecast calculated: Budget=500000, Anticipated=510000, Variance=-10000
[CVR Phase B] Recalculating forecasts for project 37 (A40 Viaduct) by pm@example.com
```

### Performance

- Budget line endpoints: < 100ms
- Project forecast endpoint: < 500ms (cached for 1 hour)
- Recalculate endpoint: ~50ms per budget line

---

## 🎓 Next Steps

**Part 4: Frontend UI** (Not yet started)

Create the following UI components:
1. Forecast Adjustment Modal
2. Budget Line Forecast Editor
3. Project Forecast Dashboard
4. Forecast Trend Visualization
5. Forecast History Timeline

---

**CVR Phase B Part 3 - API Endpoints Complete! ✅**

All endpoints are implemented, tested, and documented. Ready for frontend integration (Part 4).
