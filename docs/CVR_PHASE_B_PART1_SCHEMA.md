# CVR Phase B - Part 1: Database Schema (COMPLETE)

## 🎯 Objective

Add forecasting capabilities to CVR to answer the critical question: **"What will this project actually cost when it's done?"**

## ✅ Database Schema Changes Applied

### 1. Enhanced BudgetLine Model

**File:** `prisma/schema.prisma` (lines 1721-1729)

Added the following forecast fields to the existing `BudgetLine` model:

```prisma
// CVR Phase B: Enhanced Forecasting
forecastMethod          ForecastMethod?  @default(COMMITTED)
forecastAdjustment      Decimal          @default(0) @db.Decimal(18, 2)
forecastAdjustmentNotes String?          @db.Text
anticipatedVariations   Decimal          @default(0) @db.Decimal(18, 2)
riskAllowance           Decimal          @default(0) @db.Decimal(18, 2)
forecastUpdatedBy       String?
forecastStatus          ForecastStatus?  @default(ON_TRACK)
costToComplete          Decimal?         @db.Decimal(18, 2)
```

Also added relation:
```prisma
forecastHistory         BudgetLineForecastHistory[]
```

### 2. New Enums

**File:** `prisma/schema.prisma` (lines 61-84)

#### ForecastMethod
```prisma
enum ForecastMethod {
  COMMITTED           // Forecast = Committed (default, no manual adjustment)
  MANUAL              // QS manually set the anticipated final
  COMMITTED_PLUS_ADJ  // Forecast = Committed + Manual Adjustment
  CALCULATED          // System calculated based on trends
}
```

#### ForecastStatus
```prisma
enum ForecastStatus {
  ON_TRACK            // Forecast ≤ Budget
  AT_RISK             // Forecast within 5% over budget
  OVER_BUDGET         // Forecast > Budget
  UNDER_BUDGET        // Forecast significantly under budget (>10%)
  REQUIRES_REVIEW     // Flagged for QS review
}
```

#### ForecastChangeType
```prisma
enum ForecastChangeType {
  MANUAL_ADJUSTMENT     // QS manually changed forecast
  CONTRACT_AWARDED      // New contract affected forecast
  VARIATION_APPROVED    // Variation approval changed forecast
  PERIOD_END_REVIEW     // Monthly/quarterly forecast review
  SYSTEM_RECALCULATION  // Automated recalculation
  INITIAL_SETUP         // First forecast set
}
```

### 3. BudgetLineForecastHistory Model

**Purpose:** Audit trail for forecast changes

```prisma
model BudgetLineForecastHistory {
  id                    String   @id @default(cuid())
  tenantId              String
  budgetLineId          Int

  // Snapshot of values at this point
  previousForecast      Decimal  @db.Decimal(18, 2)
  newForecast           Decimal  @db.Decimal(18, 2)
  changeAmount          Decimal  @db.Decimal(18, 2)
  changeReason          String?  @db.Text

  // What triggered the change
  changeType            ForecastChangeType

  // Context
  committed             Decimal  @db.Decimal(18, 2)  // Committed at time of change
  actual                Decimal  @db.Decimal(18, 2)  // Actual at time of change

  // Audit
  createdAt             DateTime @default(now())
  createdBy             String

  // Relations
  budgetLine            BudgetLine @relation(fields: [budgetLineId], references: [id])

  @@index([budgetLineId])
  @@index([tenantId, createdAt])
}
```

### 4. ProjectForecast Model

**Purpose:** Project-level forecast summary (calculated from budget lines)

```prisma
model ProjectForecast {
  id                    String   @id @default(cuid())
  tenantId              String
  projectId             Int      @unique  // One active forecast per project

  // Totals (calculated from budget lines)
  totalBudget           Decimal  @db.Decimal(18, 2)
  totalCommitted        Decimal  @db.Decimal(18, 2)
  totalActual           Decimal  @db.Decimal(18, 2)
  totalAnticipatedFinal Decimal  @db.Decimal(18, 2)

  // Variances
  budgetVariance        Decimal  @db.Decimal(18, 2)  // Budget - Anticipated
  commitmentVariance    Decimal  @db.Decimal(18, 2)  // Committed - Anticipated

  // Cost to complete
  costToComplete        Decimal  @db.Decimal(18, 2)  // Anticipated - Actual

  // Risk & contingency
  totalRiskAllowance    Decimal  @db.Decimal(18, 2)
  contingencyRemaining  Decimal  @db.Decimal(18, 2)

  // Status
  overallStatus         ForecastStatus

  // Last update
  lastCalculatedAt      DateTime @default(now())
  lastReviewedAt        DateTime?
  lastReviewedBy        String?

  // Relations
  project               Project  @relation(fields: [projectId], references: [id])

  @@index([tenantId])
}
```

### 5. Project Model Update

**File:** `prisma/schema.prisma` (line 342)

Added relation to Project model:
```prisma
// CVR Phase B: Project forecast
projectForecast ProjectForecast?
```

## 📊 Database Migration

Schema changes were applied using:
```bash
npx prisma db push --accept-data-loss
```

**Result:** ✅ Database is now in sync with Prisma schema (completed in 515ms)

Prisma Client was regenerated with the new models and fields.

## 🔍 What These Fields Enable

### Budget Line Level:
1. **forecastFinalCost** - What we think this line will actually cost
2. **forecastMethod** - How the forecast was determined (manual, calculated, etc.)
3. **forecastAdjustment** - Manual QS adjustment (+ or -)
4. **forecastAdjustmentNotes** - Justification for adjustments
5. **anticipatedVariations** - Variations not yet in committed
6. **riskAllowance** - Risk/contingency for this line
7. **forecastStatus** - ON_TRACK, AT_RISK, OVER_BUDGET, etc.
8. **costToComplete** - What's left to spend
9. **forecastUpdatedBy** - Who made the last forecast change
10. **forecastHistory** - Full audit trail of changes

### Project Level:
1. **Total Anticipated Final** - Sum of all budget line forecasts
2. **Budget Variance** - How much over/under budget we're forecasting
3. **Cost to Complete** - Total remaining spend
4. **Risk Allowance** - Total contingency across all lines
5. **Overall Status** - Project-wide forecast health

## ✅ Verification

Backend server restarted successfully with new schema:
- ✅ Health check: http://localhost:3001/health
- ✅ Prisma Client regenerated
- ✅ All new enums available
- ✅ All new models accessible

## 🚀 Next Steps

**Part 2:** Service Layer
- Create forecast calculation service
- Implement forecast update methods
- Add forecast status determination logic
- Create history tracking functions

**Part 3:** API Endpoints
- GET /api/budgetlines/:id/forecast - Get forecast details
- PATCH /api/budgetlines/:id/forecast - Update forecast
- GET /api/budgetlines/:id/forecast/history - Get forecast history
- GET /api/projects/:id/forecast - Get project-level forecast summary
- POST /api/projects/:id/forecast/recalculate - Recalculate all forecasts

**Part 4:** Frontend UI
- Forecast adjustment modal
- Budget line forecast editor
- Project forecast dashboard
- Forecast trend visualization
- Forecast history timeline

## 📝 Schema Files Modified

1. `/Users/Baller/Documents/2025_ERP/2025_Backend_ERP/prisma/schema.prisma`
   - Added forecast fields to BudgetLine (lines 1721-1729)
   - Added ForecastMethod enum (lines 62-67)
   - Added ForecastStatus enum (lines 69-75)
   - Added ForecastChangeType enum (lines 77-84)
   - Added BudgetLineForecastHistory model (appended)
   - Added ProjectForecast model (appended)
   - Added projectForecast relation to Project (line 342)

## ⚠️ Important Notes

- **Existing Data:** All existing budget lines now have default forecast values:
  - `forecastMethod = COMMITTED`
  - `forecastAdjustment = 0`
  - `anticipatedVariations = 0`
  - `riskAllowance = 0`
  - `forecastStatus = ON_TRACK`

- **Forecast Calculation:** Budget lines with existing `forecastFinalCost` values are preserved. New forecasts will need to be calculated/set via the service layer (Part 2).

- **Project Forecasts:** No ProjectForecast records exist yet. These will be created on-demand when forecast calculations are triggered.

**CVR Phase B Part 1 - Database Schema Complete! ✅**
