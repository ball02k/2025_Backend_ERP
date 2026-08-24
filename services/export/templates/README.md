# Pre-built Excel Templates (Task 5.2 - Part 2)

## Overview

Pre-built template configurations for payment application exports. These are **TypeScript configuration objects** (not physical Excel files) that define how payment applications should be formatted and exported.

The templates provide ready-to-use configurations for common export scenarios in UK construction, eliminating the need to manually configure exports for standard use cases.

---

## Available Templates

### 1. Standard Payment Application (`defaultApplicationTemplate`)

**Purpose**: Full-featured template for standard UK construction payment applications

**Includes**:
- ✅ Header information (project, parties, dates, contract details)
- ✅ Line items with full progress tracking
- ✅ Variations section
- ✅ Financial summary with deductions
- ❌ Dayworks (disabled by default)
- ❌ Certification (disabled by default)

**Suitable for**:
- Standard UK construction payment applications
- JCT contracts
- NEC contracts
- General contractor applications
- Most common use cases

**Configuration**:
```typescript
{
  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: false,
    summary: true,
    certification: false,
  },
  excel: {
    sheetName: 'Payment Application',
    autoFit: true,
    currencySymbol: '£',
  }
}
```

---

### 2. Compact Payment Application (`compactApplicationTemplate`)

**Purpose**: Simplified template for smaller applications

**Includes**:
- ✅ Essential header information
- ✅ Line items only
- ✅ Summary totals
- ❌ Variations
- ❌ Dayworks
- ❌ Certification

**Suitable for**:
- Simple subcontractor applications
- Small value works (< £50k)
- Quick valuations
- Internal progress reports
- Monthly status reports

**Configuration**:
```typescript
{
  sections: {
    header: true,
    lines: true,
    variations: false,
    dayworks: false,
    summary: true,
    certification: false,
  },
  excel: {
    sheetName: 'Application',
    autoFit: true,
    currencySymbol: '£',
  }
}
```

---

### 3. Detailed Payment Application (`detailedApplicationTemplate`)

**Purpose**: Comprehensive template with all sections enabled

**Includes**:
- ✅ Full header details (including VAT, CIS numbers)
- ✅ Line items with sections
- ✅ Variations tracking
- ✅ Dayworks sheet
- ✅ Detailed summary with all deductions
- ✅ Certification section

**Suitable for**:
- Main contractor applications
- Large value projects (> £1M)
- Complex valuations with multiple deductions
- Applications requiring certification
- Final accounts
- Formal submissions

**Configuration**:
```typescript
{
  sections: {
    header: true,
    lines: true,
    variations: true,
    dayworks: true,
    summary: true,
    certification: true,
  },
  excel: {
    sheetName: 'Payment Application',
    autoFit: true,
    currencySymbol: '£',
  }
}
```

---

### 4. Subcontractor Payment Application (`subcontractorApplicationTemplate`)

**Purpose**: Optimized for subcontractor applications

**Includes**:
- ✅ Simplified header (essential details only)
- ✅ Trade-focused line items (6 columns vs 11)
- ✅ Summary with retention and MCD
- ❌ Variations
- ❌ Dayworks
- ❌ Certification

**Suitable for**:
- Specialist trade contractors
- M&E contractors
- Package subcontractors
- Tier 2/3 applications
- Domestic subcontractors

**Configuration**:
```typescript
{
  sections: {
    header: true, // Simplified
    lines: true,  // 6 columns only
    variations: false,
    dayworks: false,
    summary: true, // With MCD
    certification: false,
  },
  excel: {
    sheetName: 'Payment Application',
    autoFit: true,
    currencySymbol: '£',
  }
}
```

---

## Usage

### From Export Engine

The Export Engine automatically uses the default template when no custom template is specified:

```typescript
// Automatically uses defaultApplicationTemplate
const result = await executeExport(tenantId, userId, {
  category: 'PAYMENT_APPLICATION',
  sourceId: '123',
  format: 'XLSX',
});
```

### Direct Import

You can import and use templates directly:

```typescript
import {
  defaultApplicationTemplate,
  compactApplicationTemplate,
  detailedApplicationTemplate,
  subcontractorApplicationTemplate
} from './templates/defaultApplicationTemplate';

// Use specific template
const result = await generateExcel(data, compactApplicationTemplate);
```

### Using Helper Functions

```typescript
import {
  getTemplateByName,
  getAllTemplates,
  getTemplateNames
} from './templates/defaultApplicationTemplate';

// Get template by name
const template = getTemplateByName('Compact Payment Application');

// Get all templates
const allTemplates = getAllTemplates();
// Returns: [defaultApplicationTemplate, compactApplicationTemplate, ...]

// Get template names
const names = getTemplateNames();
// Returns: ['Standard Payment Application', 'Compact Payment Application', ...]
```

---

## Field Mappings

Each template includes field mappings that define how data maps to the output.

### Mapping Structure

```typescript
{
  sourceField: string;      // Dot notation path in data
  targetField: string;      // Cell reference (B5) or logical name
  transform?: string;       // Optional transformation
  format?: string;          // Format string for dates, etc.
  defaultValue?: any;       // Default if source is null/undefined
}
```

### Transform Types

- `currency` - Converts to number for currency formatting
- `percentage` - Converts to decimal (50 → 0.50 for Excel)
- `date` - Converts to Date object
- `number` - Converts to number

### Mapping Examples

```typescript
// Header field mapping
{
  sourceField: 'header.applicationNumber',
  targetField: 'B3',
  transform: 'number'
}

// Line item mapping (column reference without row)
{
  sourceField: 'lines.contractValue',
  targetField: 'D',
  transform: 'currency'
}

// Summary mapping (logical name for from-scratch generation)
{
  sourceField: 'summary.totalDue',
  targetField: 'summary.total',
  transform: 'currency'
}
```

---

## Template Comparison

| Feature | Standard | Compact | Detailed | Subcontractor |
|---------|----------|---------|----------|---------------|
| Header Details | Full | Minimal | Complete | Simplified |
| Line Items | 11 columns | 11 columns | 11 columns | 6 columns |
| Variations | ✅ | ❌ | ✅ | ❌ |
| Dayworks | ❌ | ❌ | ✅ | ❌ |
| Summary | Standard | Basic | Detailed | With MCD |
| Certification | ❌ | ❌ | ✅ | ❌ |
| Field Mappings | 25 | 4 | 50+ | 15 |
| Use Case | General | Quick | Formal | Trade |
| File Size | ~8KB | ~6KB | ~12KB | ~7KB |

---

## Customization

### Creating a Custom Template

You can create your own template based on an existing one:

```typescript
import { defaultApplicationTemplate } from './templates/defaultApplicationTemplate';

const myCustomTemplate: ExportTemplateConfig = {
  ...defaultApplicationTemplate,
  name: 'My Custom Template',
  sections: {
    ...defaultApplicationTemplate.sections,
    dayworks: true,  // Enable dayworks
  },
  excel: {
    ...defaultApplicationTemplate.excel,
    currencySymbol: '$',  // Use dollars
  },
};
```

### Adding to Database

To make a custom template available to users, create a database record:

```typescript
await prisma.exportTemplate.create({
  data: {
    tenantId: 'your-tenant-id',
    name: myCustomTemplate.name,
    code: 'MY_CUSTOM',
    category: 'PAYMENT_APPLICATION',
    format: 'XLSX',
    scope: 'TENANT',
    config: myCustomTemplate as any,
    fieldMappings: myCustomTemplate.fieldMappings as any,
    isActive: true,
    isDefault: false,
    createdBy: userId,
  },
});
```

---

## Integration with Export Engine

### Template Resolution Order

When exporting without specifying a template ID:

1. **Tenant default template** (if exists)
   ```sql
   SELECT * FROM ExportTemplate
   WHERE tenantId = ? AND isDefault = true AND category = ?
   ```

2. **System default template** (if exists)
   ```sql
   SELECT * FROM ExportTemplate
   WHERE tenantId IS NULL AND isDefault = true AND category = ?
   ```

3. **Built-in template** (from this file)
   ```typescript
   defaultApplicationTemplate
   ```

### Automatic Template Selection

```typescript
// Export Engine automatically selects appropriate template
class ExportEngine {
  private getBuiltInTemplate(category: ExportCategory) {
    if (category === 'PAYMENT_APPLICATION') {
      return defaultApplicationTemplate;  // From this file
    }
    // ... other categories
  }
}
```

---

## Template Sections Explained

### Header Section
- Application details (number, reference)
- Project information
- Parties (contractor, employer)
- Dates (period, valuation, submission, due)
- Contract details (value, retention %, MCD %)

### Lines Section
- Line number
- Reference code
- Description
- Contract value
- Previous cumulative value & %
- This period value & %
- Current cumulative value & %
- Remaining value

### Variations Section
- Variation number
- Reference
- Description
- Status (Approved, Pending, Rejected)
- Value
- Previous/This Period/Cumulative tracking

### Dayworks Section
- Reference
- Description
- Date
- Labour hours, rate, total
- Materials total
- Plant total
- Grand total

### Summary Section
- Gross valuation this period
- Materials on site
- Total this period
- Deductions (retention, MCD, contracharges, other)
- Net valuation
- Previous payments
- Amount due (excl VAT)
- VAT calculation
- Total amount due (incl VAT)

### Certification Section
- Certified amount
- Certified date
- Certified by (name/role)
- Variance notes

---

## Benefits of Pre-built Templates

### ✅ Consistency
- Standardized output across all exports
- Professional appearance
- Industry-standard layouts

### ✅ Convenience
- No need to configure every export
- Works out-of-the-box
- Minimal setup required

### ✅ Flexibility
- Multiple templates for different scenarios
- Easy to customize
- Can be used as base for custom templates

### ✅ Maintainability
- Centralized configuration
- Easy to update across system
- Version controlled

### ✅ Type Safety
- Full TypeScript type checking
- IntelliSense support
- Compile-time validation

---

## Migration from Old System

### Before (Hardcoded)
```typescript
// In exportEngine.ts - hardcoded configuration
private getBuiltInTemplate() {
  return {
    name: 'Standard Payment Application',
    sections: { header: true, lines: true, ... },
    fieldMappings: [ /* 20 lines of mappings */ ],
    // ... more configuration
  };
}
```

### After (Pre-built Templates)
```typescript
// In exportEngine.ts - uses pre-built template
import { defaultApplicationTemplate } from './templates/defaultApplicationTemplate';

private getBuiltInTemplate() {
  return defaultApplicationTemplate;  // Clean and simple
}
```

**Benefits**:
- Cleaner code
- Easier to maintain
- Testable in isolation
- Reusable across codebase

---

## Testing

### Unit Testing Templates
```typescript
import { defaultApplicationTemplate, getAllTemplates } from './defaultApplicationTemplate';

test('default template has correct structure', () => {
  expect(defaultApplicationTemplate.name).toBe('Standard Payment Application');
  expect(defaultApplicationTemplate.sections.header).toBe(true);
  expect(defaultApplicationTemplate.sections.lines).toBe(true);
  expect(defaultApplicationTemplate.fieldMappings.length).toBeGreaterThan(0);
});

test('all templates are valid', () => {
  const templates = getAllTemplates();
  expect(templates.length).toBeGreaterThan(0);

  templates.forEach(template => {
    expect(template.name).toBeDefined();
    expect(template.version).toBeDefined();
    expect(template.sections).toBeDefined();
    expect(template.fieldMappings).toBeInstanceOf(Array);
  });
});
```

### Integration Testing
```bash
# Test export with default template
curl "http://localhost:3001/api/projects/1/applications/1/export?format=XLSX"

# Result should use defaultApplicationTemplate
# Check file contains all expected sections
```

---

## Future Enhancements

### Planned Templates
- [ ] JCT-specific template
- [ ] NEC-specific template
- [ ] Final account template
- [ ] Retention release template
- [ ] Monthly valuation template

### Main Contractor Templates
- [ ] Balfour Beatty standard
- [ ] Kier standard
- [ ] Skanska standard
- [ ] Morgan Sindall standard
- [ ] Willmott Dixon standard

### Features
- [ ] Multi-currency templates
- [ ] Multi-language support (Welsh, etc.)
- [ ] Custom branding per template
- [ ] Template versioning
- [ ] Template inheritance

---

## Troubleshooting

### Template Not Being Used

Check template resolution order:
1. Is there a tenant default template in database?
2. Is there a system default template in database?
3. Built-in template should be used as fallback

### Field Mappings Not Working

For **template-based exports**:
- Ensure cell references are valid (e.g., "B5")
- Check template file exists in storage

For **from-scratch exports**:
- Field mappings with logical names (e.g., "summary.total") are used for placement
- Actual formatting is done by generator functions

### Missing Sections

Check template configuration:
```typescript
sections: {
  header: true,
  lines: true,
  variations: false,  // Not included if false
  dayworks: false,    // Not included if false
  summary: true,
  certification: false, // Not included if false
}
```

---

## Support

For issues or questions:
- Review template configurations in `defaultApplicationTemplate.ts`
- Check Export Engine integration in `exportEngine.ts`
- Refer to Excel Generator documentation in `EXCEL_GENERATOR_README.md`
- Check TypeScript types in `types.ts`

## License

Internal use only - ConstructERP
