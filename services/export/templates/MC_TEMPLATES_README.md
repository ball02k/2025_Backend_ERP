# Main Contractor Specific Templates (Task 5.2 - Part 4)

## Overview

Main Contractor (MC) specific templates provide pre-configured export templates that match the exact format requirements of major UK construction contractors. These templates ensure subcontractor payment applications are submitted in the precise format expected by each Main Contractor.

**File**: `services/export/templates/mcTemplates.ts`

**Purpose**: Ready-to-use templates for major UK Main Contractors

---

## Why MC-Specific Templates?

### The Problem
Each Main Contractor has their own:
- Excel template format with specific cell locations
- Branding requirements (colors, logos, fonts)
- Field requirements (some require CIS numbers, others don't)
- Layout preferences (column order, section placement)
- Calculation formulas (different retention/MCD handling)

### The Solution
Pre-configured templates that:
- Match each MC's exact format
- Map data to correct cell locations
- Apply MC branding automatically
- Include/exclude sections as required by each MC
- Ensure applications are accepted first time

---

## Available MC Templates

### 1. Balfour Beatty Template

**Name**: Balfour Beatty Application
**Code**: `balfour-beatty`
**Brand Color**: `#003366` (BB Blue)

**Features**:
- Uses BB's branded Excel template
- Includes dayworks section (required by BB)
- Fixed column widths (no auto-fit)
- Protected worksheet to prevent formula changes
- Date format: `dd-MMM-yy` (BB preference)

**Sections**:
- ✅ Header (with CIS number)
- ✅ Line items (12 columns: A-L)
- ✅ Variations
- ✅ Dayworks
- ✅ Summary with materials on site
- ❌ Certification

**Field Mappings**: 36 mappings
- Header: 15 fields
- Line items: 11 columns
- Summary: 10 fields (amounts in column G)

**Template File**: `templates/balfour_beatty_app.xlsx`
**Start Row**: 15
**Line Items Range**: A15:L

**Use Cases**:
- Subcontractor applications to Balfour Beatty
- Package valuations
- Monthly progress applications

---

### 2. Kier Group Template

**Name**: Kier Payment Application
**Code**: `kier-group`
**Brand Color**: `#E31837` (Kier Red)

**Features**:
- Uses Kier's branded Excel template
- No dayworks section
- Separate variations range
- Protected worksheet
- Date format: `dd/MM/yyyy`

**Sections**:
- ✅ Header (with CIS number)
- ✅ Line items (10 columns: A-J)
- ✅ Variations (separate section A50:F)
- ❌ Dayworks
- ✅ Summary
- ❌ Certification

**Field Mappings**: 34 mappings
- Header: 11 fields
- Line items: 9 columns
- Variations: 6 fields
- Summary: 8 fields (amounts in column H)

**Template File**: `templates/kier_app.xlsx`
**Sheet Name**: Valuation
**Start Row**: 12
**Line Items Range**: A12:J
**Variations Range**: A50:F

**Use Cases**:
- Subcontractor applications to Kier
- Trade package valuations
- Progress payments

---

### 3. Skanska Template

**Name**: Skanska Payment Application
**Code**: `skanska`
**Brand Color**: `#00A758` (Skanska Green)

**Features**:
- Uses Skanska's branded Excel template
- Includes dayworks section
- Detailed header with address
- Separate variations range
- Protected worksheet

**Sections**:
- ✅ Header (with contractor address)
- ✅ Line items (11 columns: A-K)
- ✅ Variations (A65:H)
- ✅ Dayworks
- ✅ Summary
- ❌ Certification

**Field Mappings**: 24 mappings
- Header: 9 fields
- Line items: 9 columns
- Summary: 6 fields (amounts in column H)

**Template File**: `templates/skanska_app.xlsx`
**Start Row**: 18
**Line Items Range**: A18:K
**Variations Range**: A65:H

**Use Cases**:
- Subcontractor applications to Skanska
- Package contractors
- Large value works

---

### 4. Morgan Sindall Template

**Name**: Morgan Sindall Application
**Code**: `morgan-sindall`
**Brand Color**: `#005EB8` (Morgan Sindall Blue)

**Features**:
- Uses Morgan Sindall's branded Excel template
- Includes retention and MCD tracking
- No dayworks section
- Clean, professional format
- Protected worksheet

**Sections**:
- ✅ Header (with retention % and MCD %)
- ✅ Line items (10 columns: A-J)
- ✅ Variations (A55:F)
- ❌ Dayworks
- ✅ Summary with MCD
- ❌ Certification

**Field Mappings**: 26 mappings
- Header: 9 fields (includes MCD percentage)
- Line items: 9 columns
- Summary: 8 fields (amounts in column G)

**Template File**: `templates/morgan_sindall_app.xlsx`
**Start Row**: 14
**Line Items Range**: A14:J
**Variations Range**: A55:F

**Use Cases**:
- Subcontractor applications to Morgan Sindall
- Trade packages
- Monthly valuations

---

### 5. Generic MC Template

**Name**: Generic MC Application
**Code**: `generic`
**Brand Color**: None

**Features**:
- No template file (generated from scratch)
- Works with most Main Contractors
- Auto-fit columns
- Unprotected worksheet
- All sections enabled

**Sections**:
- ✅ Header (standard fields)
- ✅ Line items (9 columns: A-I)
- ✅ Variations
- ✅ Dayworks
- ✅ Summary
- ❌ Certification

**Field Mappings**: 28 mappings
- Header: 11 fields
- Line items: 9 columns
- Summary: 8 fields (logical names for from-scratch generation)

**Template File**: None (from scratch)

**Use Cases**:
- Smaller main contractors
- Regional contractors
- Contractors without specific template requirements
- Fallback when MC-specific template unavailable

---

## MC Template Comparison

| Feature | Balfour Beatty | Kier | Skanska | Morgan Sindall | Generic |
|---------|----------------|------|---------|----------------|---------|
| **Template File** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ From scratch |
| **Dayworks** | ✅ Yes | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| **Variations** | ✅ Yes | ✅ Yes (separate) | ✅ Yes (separate) | ✅ Yes (separate) | ✅ Yes |
| **Line Columns** | 12 (A-L) | 10 (A-J) | 11 (A-K) | 10 (A-J) | 9 (A-I) |
| **Protected** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Auto-fit** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Date Format** | dd-MMM-yy | dd/MM/yyyy | dd/MM/yyyy | dd/MM/yyyy | dd/MM/yyyy |
| **Brand Color** | #003366 | #E31837 | #00A758 | #005EB8 | None |
| **Field Mappings** | 36 | 34 | 24 | 26 | 28 |
| **Start Row** | 15 | 12 | 18 | 14 | N/A |

---

## Usage

### Basic Usage

```typescript
import { getMCTemplate } from './services/export/templates/mcTemplates';

// Get Balfour Beatty template
const bbTemplate = getMCTemplate('balfour-beatty');

// Use with export engine
const result = await executeExport(tenantId, userId, {
  category: 'PAYMENT_APPLICATION',
  sourceId: applicationId,
  format: 'XLSX',
  // Pass template configuration
  options: {
    templateConfig: bbTemplate,
  },
});
```

### Case-Insensitive Matching

The `getMCTemplate()` function handles various input formats:

```typescript
// All of these work:
getMCTemplate('balfour-beatty');      // Exact match
getMCTemplate('Balfour Beatty');      // Spaces
getMCTemplate('BALFOUR BEATTY');      // Uppercase
getMCTemplate('Balfour-Beatty');      // Mixed case

// All return the Balfour Beatty template
```

### Fallback to Generic

If no specific template exists, the generic template is used:

```typescript
const template = getMCTemplate('unknown-contractor');
// Returns: genericMCTemplate (fallback)
```

### Check if MC Template Exists

```typescript
import { hasMCTemplate } from './services/export/templates/mcTemplates';

if (hasMCTemplate('balfour-beatty')) {
  console.log('Specific template available');
} else {
  console.log('Will use generic template');
}
```

### Get All MC Template Names

```typescript
import { getMCTemplateNames } from './services/export/templates/mcTemplates';

const names = getMCTemplateNames();
// Returns: [
//   'Balfour Beatty Application',
//   'Kier Payment Application',
//   'Skanska Payment Application',
//   'Morgan Sindall Application'
// ]

// Use for dropdown/selection UI
names.forEach(name => {
  console.log(`- ${name}`);
});
```

---

## Integration with Template Registry

### Seeding MC Templates to Database

```typescript
import { seedBuiltInTemplates } from './services/export/templateRegistry';
import { balfourBeattyTemplate, kierTemplate } from './services/export/templates/mcTemplates';

// Option 1: Manually create MC template records
await prisma.exportTemplate.create({
  data: {
    name: balfourBeattyTemplate.name,
    code: 'BB_APP',
    category: 'PAYMENT_APPLICATION',
    format: 'XLSX',
    scope: 'SYSTEM',
    mainContractorId: 'mc-balfour-beatty',
    mainContractorName: 'Balfour Beatty',
    config: balfourBeattyTemplate as any,
    fieldMappings: balfourBeattyTemplate.fieldMappings as any,
    isDefault: false,
    isActive: true,
  },
});

// Option 2: Create tenant-specific MC template
import { createTenantTemplate } from './services/export/templateRegistry';

const customBBTemplate = await createTenantTemplate(
  tenantId,
  userId,
  {
    code: 'CUSTOM_BB_APP',
    name: 'Custom Balfour Beatty Application',
    category: 'PAYMENT_APPLICATION',
    format: 'XLSX',
    config: balfourBeattyTemplate,
    mainContractorId: 'mc-balfour-beatty',
    mainContractorName: 'Balfour Beatty',
  }
);
```

### Auto-selecting MC Template Based on Contract

```typescript
// In your export logic
async function exportForContract(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { mainContractor: true },
  });

  // Get MC-specific template if available
  const mcId = contract.mainContractor?.id || 'generic';
  const template = getMCTemplate(mcId);

  return executeExport(tenantId, userId, {
    category: 'PAYMENT_APPLICATION',
    sourceId: contract.applicationId,
    format: 'XLSX',
    options: {
      templateConfig: template,
    },
  });
}
```

---

## Template Files

MC-specific templates reference physical Excel files that should be stored in the system's storage.

### File Structure

```
storage/
└── templates/
    ├── balfour_beatty_app.xlsx
    ├── kier_app.xlsx
    ├── skanska_app.xlsx
    └── morgan_sindall_app.xlsx
```

### Uploading Template Files

```typescript
import { uploadToStorage } from './lib/storage';
import * as fs from 'fs';

// Upload BB template file
const fileBuffer = fs.readFileSync('./templates/balfour_beatty_app.xlsx');
const result = await uploadToStorage(
  fileBuffer,
  'templates/balfour_beatty_app.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
);

console.log(`Template uploaded: ${result.url}`);
```

### Template File Requirements

Each Excel template file should:
1. Have all formatting pre-applied (colors, borders, fonts)
2. Include formulas in summary sections
3. Have cell references matching the field mappings
4. Be tested with sample data
5. Include MC branding (logo, colors)
6. Be protected (if required by MC)

---

## Creating New MC Templates

### Step 1: Obtain MC Template File

Contact the Main Contractor to obtain their official Excel template, or create one based on their requirements document.

### Step 2: Analyze Template Structure

Open the template and document:
- Sheet name
- Header cell locations
- Line items start row and range
- Variations range (if applicable)
- Summary cell locations
- Protected ranges

### Step 3: Create Template Configuration

```typescript
export const newMCTemplate: ExportTemplateConfig = {
  name: 'New MC Payment Application',
  version: '1.0',

  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: false, // Set based on MC requirements
    summary: true,
    certification: false,
  },

  excel: {
    templateFile: 'templates/new_mc_app.xlsx',
    sheetName: 'Application', // Match sheet name in file
    startRow: 15, // First row for line items
    lineItemsRange: 'A15:J', // Columns A-J starting at row 15
    variationsRange: 'A50:F', // If applicable
    autoFit: false, // Usually false for MC templates
    protectSheet: true, // Usually true for MC templates
    currencySymbol: '£',
  },

  fieldMappings: [
    // Document each cell mapping carefully
    { sourceField: 'header.applicationNumber', targetField: 'G3', transform: 'number' },
    { sourceField: 'header.projectName', targetField: 'C5' },
    // ... add all mappings
  ],

  branding: {
    primaryColor: '#RRGGBB', // MC's brand color
    fontFamily: 'Arial', // MC's preferred font
  },
};
```

### Step 4: Add to MC_TEMPLATES Registry

```typescript
export const MC_TEMPLATES: Record<string, ExportTemplateConfig> = {
  'balfour-beatty': balfourBeattyTemplate,
  'kier-group': kierTemplate,
  'skanska': skanskaTemplate,
  'morgan-sindall': morganSindallTemplate,
  'new-mc-id': newMCTemplate, // Add here
  'generic': genericMCTemplate,
};
```

### Step 5: Upload Template File

```bash
# Upload the Excel file to storage
node -e "
const { uploadToStorage } = require('./dist/lib/storage');
const fs = require('fs');
const buffer = fs.readFileSync('./templates/new_mc_app.xlsx');
uploadToStorage(buffer, 'templates/new_mc_app.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  .then(r => console.log('Uploaded:', r.url));
"
```

### Step 6: Test the Template

```bash
# Run MC template test
node test-mc-templates.cjs

# Test actual export with sample data
# (Create test application and export using new MC template)
```

---

## Testing

### Automated Test

A comprehensive test script is provided: `test-mc-templates.cjs`

```bash
node test-mc-templates.cjs
```

**Test Coverage**:
1. ✓ Verifies all MC templates are defined
2. ✓ Checks template structure (name, version, sections, etc.)
3. ✓ Validates Excel configuration
4. ✓ Counts field mappings by section
5. ✓ Checks branding configuration
6. ✓ Tests MC_TEMPLATES registry
7. ✓ Tests getMCTemplate() with various inputs
8. ✓ Tests getMCTemplateNames()
9. ✓ Tests hasMCTemplate()
10. ✓ Validates sections configuration

**Expected Output**:
```
🧪 Testing MC-Specific Templates
============================================================

📋 Step 1: Verifying MC templates...
  ✓ Balfour Beatty       - Balfour Beatty Application
  ✓ Kier                 - Kier Payment Application
  ✓ Skanska              - Skanska Payment Application
  ✓ Morgan Sindall       - Morgan Sindall Application
  ✓ Generic MC           - Generic MC Application

...

============================================================
✅ All MC template tests completed successfully!
============================================================
```

### Manual Testing

```typescript
// Test with real data
const { getMCTemplate } = require('./dist/services/export/templates/mcTemplates');
const { generateExcel } = require('./dist/services/export/generators/excelGenerator');

const bbTemplate = getMCTemplate('balfour-beatty');

const testData = {
  header: {
    applicationNumber: 5,
    projectName: 'Test Project',
    // ... fill in test data
  },
  lines: [ /* test line items */ ],
  summary: { /* test summary */ },
};

const result = await generateExcel(testData, bbTemplate);

// Save to file and open in Excel
fs.writeFileSync('test_bb_export.xlsx', result.buffer);
```

---

## Best Practices

### 1. Always Use Specific MC Template When Available

```typescript
// Good: Use MC-specific template
const template = getMCTemplate(contract.mainContractorId);

// Bad: Always use generic
const template = genericMCTemplate;
```

### 2. Test with Actual MC Template Files

Before deploying, test with the actual Excel template file provided by the MC.

```typescript
// Upload actual MC template file
await uploadToStorage(bbTemplateBuffer, 'templates/balfour_beatty_app.xlsx', ...);

// Test export
const result = await generateExcel(testData, balfourBeattyTemplate);

// Verify in Excel that all cells are populated correctly
```

### 3. Keep Templates Updated

MCs occasionally update their templates. When this happens:

```typescript
// 1. Upload new template file
await uploadToStorage(newTemplateBuffer, 'templates/balfour_beatty_app_v2.xlsx', ...);

// 2. Update template configuration
export const balfourBeattyTemplate: ExportTemplateConfig = {
  // ... update field mappings if cell references changed
  excel: {
    templateFile: 'templates/balfour_beatty_app_v2.xlsx',
    // ... update other settings
  },
};

// 3. Update version number
version: '2.0',
```

### 4. Document Cell References

Maintain a mapping spreadsheet for each MC template:

```
Cell Reference | Field Name            | Transform | Notes
---------------+----------------------+-----------+------------------
G3             | applicationNumber    | number    | Application #
C5             | projectName          | -         | Project name
G5             | periodEnd            | date      | Format: dd-MMM-yy
```

### 5. Handle Missing Fields Gracefully

```typescript
// In field mappings, provide defaults
{
  sourceField: 'header.cisNumber',
  targetField: 'C9',
  defaultValue: 'N/A', // Fallback if CIS number not available
}
```

---

## Troubleshooting

### Template File Not Found

**Error**: Template file 'templates/balfour_beatty_app.xlsx' not found

**Solution**:
```bash
# Check if file exists in storage
# Upload template file
node -e "
const { uploadToStorage } = require('./dist/lib/storage');
const fs = require('fs');
const buffer = fs.readFileSync('./path/to/balfour_beatty_app.xlsx');
uploadToStorage(buffer, 'templates/balfour_beatty_app.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
"
```

### Fields Not Populating

**Problem**: Some fields in exported file are empty

**Possible Causes**:
- Incorrect cell reference in field mapping
- Missing data in source object
- Wrong transform type

**Solution**:
```typescript
// Check field mapping
{ sourceField: 'header.projectName', targetField: 'C5' }

// Verify cell reference in Excel template (should be C5)
// Verify data exists in source object
console.log(data.header.projectName); // Should not be undefined

// Check transform type matches data type
{ sourceField: 'header.applicationNumber', targetField: 'G3', transform: 'number' }
```

### Wrong MC Template Used

**Problem**: Export uses generic template instead of MC-specific

**Solution**:
```typescript
// Check MC ID format
const mcId = contract.mainContractorId; // e.g., 'balfour-beatty'

// Verify it matches registry key
console.log(hasMCTemplate(mcId)); // Should be true

// If false, check MC_TEMPLATES keys
console.log(Object.keys(MC_TEMPLATES));
```

---

## Future Enhancements

### Additional MC Templates
- [ ] Willmott Dixon template
- [ ] Laing O'Rourke template
- [ ] Vinci Construction template
- [ ] ISG template
- [ ] McLaren Construction template

### Features
- [ ] Template version management
- [ ] MC template approval workflow
- [ ] Auto-detect MC from email domain
- [ ] Template validation against MC requirements
- [ ] MC template preview generation
- [ ] Template file version tracking

---

## Support

For issues or questions:
- Check test script output: `node test-mc-templates.cjs`
- Review template configuration in `mcTemplates.ts`
- Verify template file exists in storage
- Check field mappings match actual Excel template
- Test with sample data first

## License

Internal use only - ConstructERP
