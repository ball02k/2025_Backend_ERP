# CVR Phase A: Payment Application → CVR Actuals Connection

## Problem
CVR "Actual" costs were only calculated from Invoices. When Payment Applications from subcontractors were CERTIFIED/PAID, the CVR actuals stayed at £0 because PAs weren't included in the calculation.

## Solution Implemented

### 1. New Service: `services/cvrActualsService.cjs`

**Key Functions:**

- **`calculateActuals(tenantId, projectId, endDate)`**
  - Calculates actuals from BOTH invoices AND certified Payment Applications
  - Returns Map of budgetLineId → actual amount
  - Replaces the old invoice-only calculation

- **`updateCVRActuals(tenantId, projectId, period)`**
  - Updates CVR snapshot with latest actuals
  - Call this after certifying a PA to refresh CVR

- **`onPaymentApplicationStatusChange(paymentApplicationId)`**
  - Automatic trigger when PA status changes
  - Updates CVR when status becomes CERTIFIED/PAID

- **`getActualsBreakdown(tenantId, projectId, asOfDate)`**
  - Returns breakdown showing actuals from invoices vs PAs
  - Useful for reporting and verification

### 2. Updated `routes/projects.cvr.cjs`

- Replaced old `sumInvoicesToDate()` to use new `calculateActuals()`
- Updated refresh endpoint to work with budget lines instead of packages
- Now properly tracks PA line items linked to budget lines

### 3. How It Works

```
Payment Application Created
   ↓
PA Line Items link to Budget Lines (via budgetLineId)
   ↓
PA Status → CERTIFIED/PAID (via POST /api/payment-applications/:id/mark-certified)
   ↓
Auto-trigger: onPaymentApplicationStatusChange() called
   ↓
cvrActualsService.updateCVRActuals() updates CVR snapshot for that period
   ↓
CVR Snapshot Line actualToDate updated
   ↓
CVR shows correct Actuals! ✓
```

**NEW: Automatic CVR Updates**

When a Payment Application is certified via the API, the CVR is automatically updated:
- Route: `POST /api/payment-applications/:id/mark-certified`
- Trigger: `onPaymentApplicationStatusChange(paymentApplicationId)`
- Updates: All CVR snapshots for the period containing the PA's applicationDate/certifiedDate
- Error Handling: CVR update failures don't block PA certification (logged only)

## API Endpoints

### Refresh CVR Actuals
```http
POST /api/projects/:projectId/cvr/refresh
Content-Type: application/json

{
  "period": "2025-12"
}
```

Response:
```json
{
  "ok": true,
  "message": "Updated 15 lines with actuals",
  "totalLines": 25
}
```

### Get Actuals Breakdown
To add this endpoint, create:
```javascript
router.get('/projects/:projectId/cvr/actuals-breakdown', async (req, res, next) => {
  const { getActualsBreakdown } = require('../services/cvrActualsService.cjs');
  const tenantId = req.user?.tenantId || req.tenantId;
  const projectId = Number(req.params.projectId);
  const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();

  const breakdown = await getActualsBreakdown(tenantId, projectId, asOfDate);
  res.json(breakdown);
});
```

## Data Requirements

For this to work properly, ensure:

1. **Payment Application Line Items** must have `budgetLineId` set
   - Links PA line items to budget lines
   - Already exists in your schema ✓

2. **Payment Applications** must have:
   - `direction: 'INBOUND'` (applications FROM subs)
   - `status: 'CERTIFIED' | 'PAID' | 'PART_PAID'`
   - Line items with `budgetLineId`

3. **CVR Snapshot Lines** must have:
   - `budgetLineId` set (links to budget)

## Testing

### 1. Create a Payment Application with Line Items
```javascript
const pa = await prisma.applicationForPayment.create({
  data: {
    tenantId: 'demo',
    projectId: 37,
    direction: 'INBOUND',
    status: 'SUBMITTED',
    claimedGrossValue: 50000,
    lineItems: {
      create: [
        {
          budgetLineId: 123, // Link to a budget line
          description: 'Foundation works',
          valueThisPeriod: 25000,
          valueCumulative: 25000,
        },
        {
          budgetLineId: 124,
          description: 'Steel frame',
          valueThisPeriod: 25000,
          valueCumulative: 25000,
        },
      ],
    },
  },
});
```

### 2. Certify the PA
```javascript
await prisma.applicationForPayment.update({
  where: { id: pa.id },
  data: {
    status: 'CERTIFIED',
    certifiedGrossValue: 48000, // QS certified less than claimed
    certifiedDate: new Date(),
  },
});
```

### 3. Refresh CVR
```bash
curl -X POST http://localhost:3001/api/projects/37/cvr/refresh \
  -H "Content-Type: application/json" \
  -d '{"period": "2025-12"}'
```

### 4. Check CVR
```bash
curl http://localhost:3001/api/projects/37/cvr?period=2025-12
```

The `actualToDate` fields should now include the certified PA amounts!

## Next Steps (Future Phases)

- **Phase B**: Forecast & Anticipated Final Cost
- **Phase C**: Revenue & Profit Tracking
- **Phase D**: Cashflow Forecasting
- **Phase E**: Enhanced Visualizations

## Migration Notes

If you have existing Payment Applications:

1. **Run the backfill script** to link PA line items to budget lines:
   ```bash
   node scripts/backfill-pa-budget-links.cjs
   ```
   This script:
   - Finds PA line items without `budgetLineId`
   - Attempts to match them to budget lines by code/description
   - Updates the links automatically
   - Reports unmatched items for manual review

2. Run a one-time CVR refresh for all open periods
3. Old CVR snapshots will automatically recalculate on next refresh

**Note:** Historical PAs are automatically included in CVR actuals calculations once their line items have `budgetLineId` set. No need to create separate CVR entry records!

## Troubleshooting

**CVR actuals still show £0 after certifying PA:**
1. Check PA has `direction: 'INBOUND'`
2. Check PA line items have `budgetLineId` set
3. Check budget line IDs are correct
4. Call refresh endpoint manually

**PA line items don't have budgetLineId:**
- Need to set this when creating PA line items
- Can backfill with SQL:
  ```sql
  UPDATE "PaymentApplicationLineItem"
  SET "budgetLineId" = 123
  WHERE "description" LIKE '%foundation%';
  ```

## Performance Notes

- `calculateActuals()` queries both invoices AND PAs
- For large projects, consider:
  - Adding indexes on `PaymentApplicationLineItem.budgetLineId`
  - Caching actuals calculation results
  - Only refreshing affected budget lines instead of entire snapshot
