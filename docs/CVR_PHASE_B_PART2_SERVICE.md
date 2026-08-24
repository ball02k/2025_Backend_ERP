# CVR Phase B - Part 2: Service Layer (COMPLETE)

## 🎯 Objective

Implement the business logic for CVR forecasting to calculate anticipated final costs, manage forecast updates, track history, and provide project-level summaries.

## ✅ Service Layer Implementation

### File Created: `services/cvrForecastService.cjs`

This service provides all the core forecast calculation and management functionality for CVR Phase B.

---

## 📦 Core Functions

### 1. calculateAnticipatedFinal(budgetLine)

**Purpose:** Calculate anticipated final cost based on forecast method

**Forecast Methods Supported:**

| Method | Calculation | Use Case |
|--------|-------------|----------|
| `COMMITTED` | = Committed | Default, no manual adjustments |
| `MANUAL` | = forecastFinalCost | QS manually sets the anticipated final |
| `COMMITTED_PLUS_ADJ` | = Committed + Adjustment + Variations + Risk | Most common method for QS forecasting |
| `CALCULATED` | System calculation (future) | Currently same as COMMITTED_PLUS_ADJ |

**Example:**
```javascript
const anticipatedFinal = calculateAnticipatedFinal({
  committed: 50000,
  forecastMethod: 'COMMITTED_PLUS_ADJ',
  forecastAdjustment: 3000,
  anticipatedVariations: 2000,
  riskAllowance: 1000
});
// Result: 56000
```

**Test Results:** ✅ All methods tested and working

---

### 2. determineForecastStatus(budget, anticipatedFinal)

**Purpose:** Determine forecast health status

**Status Logic:**

| Status | Condition | Description |
|--------|-----------|-------------|
| `ON_TRACK` | Forecast ≤ Budget | Within budget, <10% under |
| `UNDER_BUDGET` | Forecast < Budget by >10% | Significantly under budget |
| `AT_RISK` | Forecast > Budget by ≤5% | Slightly over budget |
| `OVER_BUDGET` | Forecast > Budget by >5% | Significantly over budget |
| `REQUIRES_REVIEW` | (Set by project level) | Many lines over/at risk |

**Example:**
```javascript
determineForecastStatus(100000, 103000); // Returns: 'AT_RISK' (3% over)
determineForecastStatus(100000, 110000); // Returns: 'OVER_BUDGET' (10% over)
determineForecastStatus(100000, 85000);  // Returns: 'UNDER_BUDGET' (15% under)
```

**Test Results:** ✅ All status calculations correct

---

### 3. calculateCostToComplete(anticipatedFinal, actual)

**Purpose:** Calculate remaining spend (what's left to pay)

**Formula:** `Cost to Complete = Anticipated Final - Actual`

**Example:**
```javascript
calculateCostToComplete(50000, 20000); // Returns: 30000 (£30k left to spend)
```

**Note:** Cannot be negative (floor at 0)

---

### 4. updateBudgetLineForecast(params)

**Purpose:** Update budget line forecast with automatic history tracking

**Parameters:**
```javascript
{
  tenantId: 'demo',
  budgetLineId: 123,
  updates: {
    forecastMethod: 'COMMITTED_PLUS_ADJ',
    forecastAdjustment: 5000,
    forecastAdjustmentNotes: 'Anticipated price increase',
    anticipatedVariations: 2000,
    riskAllowance: 1000
  },
  changeType: 'MANUAL_ADJUSTMENT',
  changeReason: 'QS review - material costs increasing',
  updatedBy: 'john.doe@example.com'
}
```

**What It Does:**
1. Gets current budget line state
2. Calculates previous and new anticipated final costs
3. Updates budget line with new forecast data
4. Calculates and updates `forecastStatus`
5. Calculates and updates `costToComplete`
6. **Creates history record** in `BudgetLineForecastHistory`
7. Returns updated budget line

**History Record Created:**
```javascript
{
  previousForecast: 45000,
  newForecast: 52000,
  changeAmount: 7000,
  changeType: 'MANUAL_ADJUSTMENT',
  changeReason: 'QS review - material costs increasing',
  committed: 45000,
  actual: 15000,
  createdBy: 'john.doe@example.com',
  createdAt: '2025-12-08T15:01:31Z'
}
```

**Test Results:** ✅ Forecast updated, history created successfully

---

### 5. calculateProjectForecast(tenantId, projectId)

**Purpose:** Calculate project-level forecast summary from all budget lines

**What It Calculates:**

| Field | Description |
|-------|-------------|
| `totalBudget` | Sum of all budget line original values |
| `totalCommitted` | Sum of all committed amounts |
| `totalActual` | Sum of all actual costs |
| `totalAnticipatedFinal` | Sum of all anticipated final costs |
| `budgetVariance` | Budget - Anticipated (positive = under budget) |
| `commitmentVariance` | Committed - Anticipated |
| `costToComplete` | Total remaining spend |
| `totalRiskAllowance` | Sum of all risk allowances |
| `contingencyRemaining` | Same as budgetVariance |
| `overallStatus` | Project-wide forecast status |

**Status Determination:**
- Calculates forecast status for the entire project
- Overrides to `REQUIRES_REVIEW` if:
  - Any budget lines are OVER_BUDGET
  - More than 20% of lines are AT_RISK

**Usage:**
```javascript
const projectForecast = await calculateProjectForecast('demo', 37);
```

**Output:**
```javascript
{
  projectId: 37,
  totalBudget: 500000,
  totalCommitted: 450000,
  totalActual: 200000,
  totalAnticipatedFinal: 510000,
  budgetVariance: -10000,        // £10k over budget
  commitmentVariance: -60000,    // £60k over committed
  costToComplete: 310000,        // £310k left to spend
  totalRiskAllowance: 15000,
  contingencyRemaining: -10000,
  overallStatus: 'REQUIRES_REVIEW',
  lastCalculatedAt: '2025-12-08T15:01:31Z'
}
```

**Database Record:** Upserted to `ProjectForecast` table (one record per project)

**Test Results:** ✅ Project forecast calculated and saved

---

### 6. recalculateAllForecasts(tenantId, projectId, triggeredBy)

**Purpose:** Recalculate forecasts for all budget lines (bulk update)

**When To Use:**
- After bulk data imports
- After major contract awards
- Periodic monthly/quarterly reviews
- After budget restructuring

**What It Does:**
1. Gets all budget lines for the project
2. Recalculates anticipated final for each
3. Updates only if forecast changed (≥£0.01)
4. Creates history records for changed forecasts
5. Recalculates project-level forecast
6. Returns summary

**Usage:**
```javascript
const result = await recalculateAllForecasts('demo', 37, 'system');
```

**Response:**
```javascript
{
  ok: true,
  totalLines: 45,
  updatedCount: 12,
  unchangedCount: 33
}
```

**Change Type:** `SYSTEM_RECALCULATION`

---

### 7. getForecastHistory(tenantId, budgetLineId, limit = 50)

**Purpose:** Get audit trail of forecast changes

**Returns:** Array of `BudgetLineForecastHistory` records, newest first

**Example Record:**
```javascript
{
  id: 'abc123',
  budgetLineId: 479,
  previousForecast: 45000,
  newForecast: 52000,
  changeAmount: 7000,
  changeReason: 'QS review - material costs increasing',
  changeType: 'MANUAL_ADJUSTMENT',
  committed: 45000,
  actual: 15000,
  createdAt: '2025-12-08T15:01:31Z',
  createdBy: 'john.doe@example.com'
}
```

**Test Results:** ✅ History retrieved successfully

---

### 8. getForecastBreakdown(tenantId, budgetLineId)

**Purpose:** Get detailed breakdown showing all forecast components

**Returns:**
```javascript
{
  budgetLineId: 479,
  originalBudget: 50000,
  committed: 45000,
  actual: 15000,

  // Forecast components
  forecastMethod: 'COMMITTED_PLUS_ADJ',
  forecastAdjustment: 5000,
  anticipatedVariations: 2000,
  riskAllowance: 1000,

  // Calculated values
  anticipatedFinal: 53000,
  costToComplete: 38000,
  forecastVariance: 3000,
  forecastStatus: 'AT_RISK',

  // Metadata
  lastUpdated: '2025-12-08T15:01:31Z',
  updatedBy: 'john.doe@example.com',
  notes: 'Anticipated price increase'
}
```

**Use Case:** Display in UI breakdown modal, showing how forecast was calculated

**Test Results:** ✅ Breakdown showing all components correctly

---

### 9. onContractAwarded(tenantId, contractId, updatedBy)

**Purpose:** Automatic trigger when a contract is awarded

**What It Does:**
1. Gets contract and its linked budget lines
2. Updates forecasts for all linked budget lines
3. Creates history records with `CONTRACT_AWARDED` change type
4. Recalculates project-level forecast
5. Returns summary

**Usage:** Call this from the contract award endpoint

**Change Type:** `CONTRACT_AWARDED`

**Change Reason:** Auto-generated (e.g., "Contract ABC-123 awarded")

---

## 🔍 Forecast Method Strategies

### Strategy 1: Simple Committed (Default)
```javascript
forecastMethod: 'COMMITTED'
```
- **Use when:** Budget line is fully tendered, no variations expected
- **Calculation:** Anticipated = Committed
- **Best for:** Simple subcontract packages with fixed scope

### Strategy 2: Manual Override
```javascript
forecastMethod: 'MANUAL'
forecastFinalCost: 55000
```
- **Use when:** QS has specific knowledge of final cost
- **Calculation:** Anticipated = forecastFinalCost
- **Best for:** Complex negotiations, known settlements

### Strategy 3: Committed Plus Adjustments (Most Common)
```javascript
forecastMethod: 'COMMITTED_PLUS_ADJ'
forecastAdjustment: 3000
anticipatedVariations: 2000
riskAllowance: 1000
```
- **Use when:** Variations/risks anticipated but not yet in committed
- **Calculation:** Anticipated = Committed + Adjustment + Variations + Risk
- **Best for:** Active projects with ongoing variations

---

## 📊 Testing Results

### Test Suite: `test-forecast-service.cjs`

**All Tests Passed ✅**

| Test | Result |
|------|--------|
| calculateAnticipatedFinal() - COMMITTED | ✅ Pass |
| calculateAnticipatedFinal() - MANUAL | ✅ Pass |
| calculateAnticipatedFinal() - COMMITTED_PLUS_ADJ | ✅ Pass |
| determineForecastStatus() - ON_TRACK | ✅ Pass |
| determineForecastStatus() - UNDER_BUDGET | ✅ Pass |
| determineForecastStatus() - AT_RISK | ✅ Pass |
| determineForecastStatus() - OVER_BUDGET | ✅ Pass |
| updateBudgetLineForecast() | ✅ Pass |
| History record created | ✅ Pass |
| getForecastBreakdown() | ✅ Pass |
| calculateProjectForecast() | ✅ Pass |

**Test Data Created:**
- Budget line 479 forecast updated
- Forecast adjustment: £5,000
- History record created
- Project forecast calculated

---

## 🚀 Next Steps

**Part 3: API Endpoints** (Not yet started)

Create the following endpoints to expose forecast functionality:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/budgetlines/:id/forecast` | Get forecast details |
| PATCH | `/api/budgetlines/:id/forecast` | Update forecast |
| GET | `/api/budgetlines/:id/forecast/history` | Get forecast history |
| GET | `/api/budgetlines/:id/forecast/breakdown` | Get forecast breakdown |
| GET | `/api/projects/:id/forecast` | Get project-level forecast |
| POST | `/api/projects/:id/forecast/recalculate` | Recalculate all forecasts |

---

## 📝 Files Created

1. **`/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/services/cvrForecastService.cjs`**
   - Complete forecast service with all functions
   - 450+ lines of documented code
   - Comprehensive error handling
   - Logging for monitoring

2. **`/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/test-forecast-service.cjs`**
   - Complete test suite
   - Tests all core functions
   - Creates test data
   - Verifies calculations and history tracking

3. **`/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/docs/CVR_PHASE_B_PART2_SERVICE.md`**
   - This documentation file

---

## 🔍 Key Design Decisions

### Decision 1: Separate Forecast Components
**Rationale:** Allow QS to see individual components (adjustment, variations, risk) rather than one monolithic forecast amount.

**Benefits:**
- Transparency in forecast calculation
- Easy to explain why forecast changed
- Better audit trail

### Decision 2: Automatic History Tracking
**Rationale:** Every forecast update creates a history record automatically.

**Benefits:**
- Complete audit trail
- Track forecast trends over time
- Accountability for changes

### Decision 3: Multiple Forecast Methods
**Rationale:** Different budget lines need different forecast approaches.

**Benefits:**
- Flexibility for QS workflow
- Simple default (COMMITTED)
- Detailed when needed (COMMITTED_PLUS_ADJ)

### Decision 4: Project-Level Aggregation
**Rationale:** Automatic roll-up to project level with status determination.

**Benefits:**
- Executive dashboard ready
- Early warning system (REQUIRES_REVIEW)
- No manual summation needed

---

## ⚠️ Important Notes

### History Record Creation
- Only created if change ≥ £0.01
- Prevents noise from floating point rounding
- All significant changes tracked

### Forecast Status Auto-Calculation
- Recalculated on every forecast update
- Based on budget vs anticipated final
- Cannot be manually overridden (ensures consistency)

### Cost to Complete
- Cannot be negative (floor at 0)
- If actual > anticipated, shows 0 (not negative)
- Indicates "overspent" via negative variance

### Project Forecast Upsert
- One ProjectForecast record per project
- Automatically created/updated on calculation
- `lastCalculatedAt` tracks freshness

---

## 🎓 Usage Examples

### Example 1: QS Adds Forecast Adjustment
```javascript
await updateBudgetLineForecast({
  tenantId: 'demo',
  budgetLineId: 123,
  updates: {
    forecastMethod: 'COMMITTED_PLUS_ADJ',
    forecastAdjustment: 5000,
    forecastAdjustmentNotes: 'Anticipated material price increase based on supplier quote'
  },
  changeType: 'MANUAL_ADJUSTMENT',
  changeReason: 'Monthly forecast review',
  updatedBy: 'qs@example.com'
});
```

### Example 2: Add Anticipated Variations
```javascript
await updateBudgetLineForecast({
  tenantId: 'demo',
  budgetLineId: 124,
  updates: {
    forecastMethod: 'COMMITTED_PLUS_ADJ',
    anticipatedVariations: 12000,
    forecastAdjustmentNotes: 'Variation Order #5 pending approval'
  },
  changeType: 'VARIATION_APPROVED',
  changeReason: 'VO-005 approved by client, pending formal variation',
  updatedBy: 'pm@example.com'
});
```

### Example 3: Add Risk Allowance
```javascript
await updateBudgetLineForecast({
  tenantId: 'demo',
  budgetLineId: 125,
  updates: {
    forecastMethod: 'COMMITTED_PLUS_ADJ',
    riskAllowance: 3000,
    forecastAdjustmentNotes: 'Ground condition risk - possible additional piling'
  },
  changeType: 'MANUAL_ADJUSTMENT',
  changeReason: 'Risk assessment review',
  updatedBy: 'qs@example.com'
});
```

---

## 📈 Performance Considerations

### Current Implementation
- All calculations done in-memory (fast)
- Database updates are transactional
- Project forecast uses single upsert

### Optimization Opportunities (if needed)
- Cache project forecasts (refresh on-demand)
- Batch history record creation
- Index on `BudgetLineForecastHistory.budgetLineId`
- Index on `BudgetLineForecastHistory.createdAt`

---

**CVR Phase B Part 2 - Service Layer Complete! ✅**

Ready for Part 3: API Endpoints implementation.
