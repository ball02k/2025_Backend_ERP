# Excel Style Utilities (Task 5.2 - Part 5)

## Overview

Excel Style Utilities provide reusable style definitions and helper functions for creating consistently formatted Excel exports. These utilities ensure professional, construction-industry-appropriate formatting across all generated Excel files.

**File**: `services/export/generators/excelStyles.ts`

**Purpose**: Centralized styling system for Excel generation

---

## Features

### ✅ Predefined Styles
- **15 style definitions** for common formatting needs
- Headers (title, subtitle, section headers)
- Table styles (headers, cells, totals)
- Number formats (currency, percentage, date)
- Highlights (yellow, green, red)
- Special styles (final total, labels, values)

### ✅ Style Application Functions
- Apply styles to individual cells
- Apply styles to entire rows
- Apply styles to cell ranges
- Apply alternating row colors (zebra striping)

### ✅ Column Configuration
- Pre-configured column layouts for common report types
- Payment application (11 columns)
- Variations (8 columns)
- Dayworks (9 columns)
- Compact (6 columns)

### ✅ Utility Functions
- Set column widths
- Auto-fit columns
- Apply currency/percentage formatting to columns
- Create summary sections
- Create header rows
- Branded header generation

---

## Style Definitions

### STYLES Object

All predefined styles are available in the `STYLES` constant:

```typescript
import { STYLES } from './services/export/generators/excelStyles';
```

### Header Styles

#### title
```typescript
{
  font: { size: 16, bold: true },
  alignment: { horizontal: 'center', vertical: 'middle' },
}
```
**Use for**: Main document title

#### subtitle
```typescript
{
  font: { size: 14, bold: true },
  alignment: { horizontal: 'center', vertical: 'middle' },
}
```
**Use for**: Document subtitle or application number

#### sectionHeader
```typescript
{
  font: { size: 12, bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
}
```
**Use for**: Section headings (Line Items, Variations, Summary)

### Table Styles

#### tableHeader
```typescript
{
  font: { bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  border: { top, bottom, left, right: { style: 'thin' } },
}
```
**Use for**: Table column headers
**Color**: Light blue (#D9E1F2)

#### tableCell
```typescript
{
  alignment: { vertical: 'middle' },
  border: { top, bottom, left, right: { style: 'thin' } },
}
```
**Use for**: Table data cells

#### tableTotals
```typescript
{
  font: { bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } },
  border: { top: { style: 'double' }, bottom: { style: 'double' } },
}
```
**Use for**: Totals rows in tables
**Color**: Light gray (#F0F0F0)
**Borders**: Double top and bottom

### Number Format Styles

#### currency
```typescript
{
  numFmt: '£#,##0.00',
  alignment: { horizontal: 'right' },
}
```
**Use for**: Currency values
**Format**: £1,234.56

#### percentage
```typescript
{
  numFmt: '0.00%',
  alignment: { horizontal: 'center' },
}
```
**Use for**: Percentage values
**Format**: 12.34%

#### date
```typescript
{
  numFmt: 'dd/mm/yyyy',
  alignment: { horizontal: 'center' },
}
```
**Use for**: Date values
**Format**: 25/12/2024 (UK format)

### Highlight Styles

#### highlightYellow
```typescript
{
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0B3' } },
}
```
**Use for**: Warning highlights, pending items
**Color**: Light yellow (#FFF0B3)

#### highlightGreen
```typescript
{
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5F5E3' } },
}
```
**Use for**: Success highlights, approved items
**Color**: Light green (#D5F5E3)

#### highlightRed
```typescript
{
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFADBD8' } },
}
```
**Use for**: Error highlights, rejected items
**Color**: Light red (#FADBD8)

### Special Styles

#### finalTotal
```typescript
{
  font: { size: 12, bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0B3' } },
  border: { top: { style: 'double' }, bottom: { style: 'double' } },
  numFmt: '£#,##0.00',
  alignment: { horizontal: 'right' },
}
```
**Use for**: Final total amount
**Color**: Yellow highlight
**Borders**: Double lines top and bottom

#### label
```typescript
{
  font: { bold: true },
  alignment: { horizontal: 'left', vertical: 'middle' },
}
```
**Use for**: Labels in summary sections

#### value
```typescript
{
  alignment: { horizontal: 'right', vertical: 'middle' },
}
```
**Use for**: Values in summary sections

---

## Style Application Functions

### applyStyle()

Apply a style to a single cell.

**Signature**:
```typescript
function applyStyle(cell: ExcelJS.Cell, style: Partial<ExcelJS.Style>): void
```

**Example**:
```typescript
import { applyStyle, STYLES } from './excelStyles';

const cell = worksheet.getCell('A1');
cell.value = 'Payment Application';
applyStyle(cell, STYLES.title);
```

---

### applyRowStyle()

Apply a style to all cells in a row.

**Signature**:
```typescript
function applyRowStyle(row: ExcelJS.Row, style: Partial<ExcelJS.Style>): void
```

**Example**:
```typescript
const row = worksheet.getRow(5);
row.values = ['No.', 'Ref', 'Description', 'Value'];
applyRowStyle(row, STYLES.tableHeader);
```

---

### applyRangeStyle()

Apply a style to a range of cells using row/column numbers.

**Signature**:
```typescript
function applyRangeStyle(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  style: Partial<ExcelJS.Style>
): void
```

**Example**:
```typescript
// Style cells from row 10 to row 50, columns 1 to 11 (A-K)
applyRangeStyle(worksheet, 10, 50, 1, 11, STYLES.tableCell);
```

---

### applyRangeStyleByName()

Apply a style to a named range (e.g., "A5:K10").

**Signature**:
```typescript
function applyRangeStyleByName(
  worksheet: ExcelJS.Worksheet,
  range: string,
  style: Partial<ExcelJS.Style>
): void
```

**Example**:
```typescript
// Style all line items
applyRangeStyleByName(worksheet, 'A10:K50', STYLES.tableCell);

// Style single cell
applyRangeStyleByName(worksheet, 'G55', STYLES.finalTotal);
```

---

### applyAlternatingRows()

Apply alternating row colors (zebra striping) for better readability.

**Signature**:
```typescript
function applyAlternatingRows(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  evenColor: string = 'FFFFFFFF',
  oddColor: string = 'FFF5F5F5'
): void
```

**Example**:
```typescript
// White and light gray alternating rows
applyAlternatingRows(worksheet, 10, 50, 1, 11, 'FFFFFFFF', 'FFF5F5F5');
```

---

## Column Configuration

### COLUMN_CONFIGS

Predefined column configurations for common report types.

### Payment Application Configuration

**11 columns**: No., Ref, Description, Contract Value, Prev %, Previous, This %, This Period, Cum %, Cumulative, Remaining

```typescript
COLUMN_CONFIGS.paymentApplication
```

**Configuration**:
```typescript
[
  { key: 'lineNo', width: 5, header: 'No.' },
  { key: 'ref', width: 12, header: 'Ref' },
  { key: 'description', width: 40, header: 'Description' },
  { key: 'contractValue', width: 15, header: 'Contract Value', style: 'currency' },
  { key: 'prevPct', width: 10, header: 'Prev %', style: 'percentage' },
  { key: 'prevValue', width: 15, header: 'Previous', style: 'currency' },
  { key: 'thisPct', width: 10, header: 'This %', style: 'percentage' },
  { key: 'thisValue', width: 15, header: 'This Period', style: 'currency' },
  { key: 'cumPct', width: 10, header: 'Cum %', style: 'percentage' },
  { key: 'cumValue', width: 15, header: 'Cumulative', style: 'currency' },
  { key: 'remaining', width: 15, header: 'Remaining', style: 'currency' },
]
```

### Variations Configuration

**8 columns**: No., Ref, Description, Status, Value, Previous, This Period, Cumulative

```typescript
COLUMN_CONFIGS.variations
```

### Dayworks Configuration

**9 columns**: Ref, Description, Date, Hours, Rate, Labour, Materials, Plant, Total

```typescript
COLUMN_CONFIGS.dayworks
```

### Compact Configuration

**6 columns**: No., Description, Contract Value, Previous, This Period, Cumulative

```typescript
COLUMN_CONFIGS.compact
```

---

## Utility Functions

### applyColumnConfig()

Apply a column configuration to set widths and keys.

**Signature**:
```typescript
function applyColumnConfig(
  worksheet: ExcelJS.Worksheet,
  config: Array<{ key: string; width: number; header: string; style?: string }>,
  startCol: number = 1
): void
```

**Example**:
```typescript
import { COLUMN_CONFIGS, applyColumnConfig } from './excelStyles';

applyColumnConfig(worksheet, COLUMN_CONFIGS.paymentApplication, 1);
```

---

### createHeaderRow()

Create a header row from column configuration.

**Signature**:
```typescript
function createHeaderRow(
  worksheet: ExcelJS.Worksheet,
  config: Array<{ key: string; width: number; header: string; style?: string }>,
  row: number,
  startCol: number = 1
): void
```

**Example**:
```typescript
// Create header row at row 10
createHeaderRow(worksheet, COLUMN_CONFIGS.paymentApplication, 10, 1);
```

---

### setColumnWidths()

Set column widths for a worksheet.

**Signature**:
```typescript
function setColumnWidths(worksheet: ExcelJS.Worksheet, columnWidths: number[]): void
```

**Example**:
```typescript
// Set widths for columns A-F
setColumnWidths(worksheet, [5, 12, 40, 15, 15, 15]);
```

---

### autoFitColumns()

Automatically fit column widths based on content.

**Signature**:
```typescript
function autoFitColumns(
  worksheet: ExcelJS.Worksheet,
  minWidth: number = 10,
  maxWidth: number = 50
): void
```

**Example**:
```typescript
// Auto-fit all columns with min 10, max 50
autoFitColumns(worksheet, 10, 50);
```

---

### applyCurrencyColumn()

Apply currency formatting to an entire column.

**Signature**:
```typescript
function applyCurrencyColumn(
  worksheet: ExcelJS.Worksheet,
  colNumber: number,
  startRow: number,
  endRow: number,
  currencySymbol: string = '£'
): void
```

**Example**:
```typescript
// Format column D (4) as currency from row 10 to 50
applyCurrencyColumn(worksheet, 4, 10, 50, '£');
```

---

### applyPercentageColumn()

Apply percentage formatting to an entire column.

**Signature**:
```typescript
function applyPercentageColumn(
  worksheet: ExcelJS.Worksheet,
  colNumber: number,
  startRow: number,
  endRow: number
): void
```

**Example**:
```typescript
// Format column E (5) as percentage from row 10 to 50
applyPercentageColumn(worksheet, 5, 10, 50);
```

---

### createSummarySection()

Create a summary section with label-value pairs.

**Signature**:
```typescript
function createSummarySection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  labelCol: number,
  valueCol: number,
  items: Array<{ label: string; value: number | string; highlight?: boolean; isCurrency?: boolean }>
): number
```

**Returns**: Next available row after summary

**Example**:
```typescript
const nextRow = createSummarySection(worksheet, 50, 2, 4, [
  { label: 'Gross Valuation', value: 150000, isCurrency: true },
  { label: 'Retention (5%)', value: -7500, isCurrency: true },
  { label: 'Net Valuation', value: 142500, isCurrency: true },
  { label: 'Previous Payments', value: -100000, isCurrency: true },
  { label: 'Amount Due', value: 42500, isCurrency: true },
  { label: 'VAT (20%)', value: 8500, isCurrency: true },
  { label: 'TOTAL DUE', value: 51000, highlight: true, isCurrency: true },
]);

console.log(`Next available row: ${nextRow}`);
```

---

### addBrandedHeader()

Create a branded header with company name and optional logo.

**Signature**:
```typescript
async function addBrandedHeader(
  worksheet: ExcelJS.Worksheet,
  branding: { logoUrl?: string; primaryColor?: string; companyName?: string },
  startRow: number = 1
): Promise<number>
```

**Returns**: Next available row after header

**Example**:
```typescript
const nextRow = await addBrandedHeader(worksheet, {
  companyName: 'Acme Construction Ltd',
  primaryColor: '#1E40AF',
}, 1);

// Start content at nextRow
```

---

### getStyleByName()

Get a style definition by name.

**Signature**:
```typescript
function getStyleByName(styleName: string): Partial<ExcelJS.Style> | undefined
```

**Example**:
```typescript
const currencyStyle = getStyleByName('currency');
if (currencyStyle) {
  applyStyle(cell, currencyStyle);
}
```

---

## Complete Example

### Creating a Styled Payment Application

```typescript
import ExcelJS from 'exceljs';
import {
  STYLES,
  COLUMN_CONFIGS,
  applyStyle,
  applyColumnConfig,
  createHeaderRow,
  applyRangeStyle,
  applyCurrencyColumn,
  applyPercentageColumn,
  createSummarySection,
} from './services/export/generators/excelStyles';

async function createStyledPaymentApplication() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Payment Application');

  let currentRow = 1;

  // Title
  const titleCell = worksheet.getCell(`A${currentRow}`);
  titleCell.value = 'INTERIM PAYMENT APPLICATION';
  applyStyle(titleCell, STYLES.title);
  worksheet.mergeCells(`A${currentRow}:K${currentRow}`);
  currentRow += 2;

  // Subtitle
  const subtitleCell = worksheet.getCell(`A${currentRow}`);
  subtitleCell.value = 'Application No. 5';
  applyStyle(subtitleCell, STYLES.subtitle);
  worksheet.mergeCells(`A${currentRow}:K${currentRow}`);
  currentRow += 2;

  // Header information
  const headerItems = [
    ['Project:', 'New Office Building'],
    ['Contractor:', 'ABC Construction Ltd'],
    ['Period:', '01/12/2024 - 31/12/2024'],
    ['Contract Value:', '£1,500,000.00'],
  ];

  headerItems.forEach(([label, value]) => {
    worksheet.getCell(currentRow, 2).value = label;
    worksheet.getCell(currentRow, 4).value = value;
    applyStyle(worksheet.getCell(currentRow, 2), STYLES.label);
    currentRow++;
  });
  currentRow += 2;

  // Section header
  const sectionCell = worksheet.getCell(`A${currentRow}`);
  sectionCell.value = 'LINE ITEMS';
  applyStyle(sectionCell, STYLES.sectionHeader);
  worksheet.mergeCells(`A${currentRow}:K${currentRow}`);
  currentRow++;

  // Apply column configuration
  applyColumnConfig(worksheet, COLUMN_CONFIGS.paymentApplication, 1);

  // Create table header
  createHeaderRow(worksheet, COLUMN_CONFIGS.paymentApplication, currentRow, 1);
  const headerRow = currentRow;
  currentRow++;

  // Add line items
  const lineItems = [
    [1, 'A-100', 'Preliminaries', 150000, 0.8, 120000, 0.1, 15000, 0.9, 135000, 15000],
    [2, 'B-200', 'Groundworks', 300000, 0.5, 150000, 0.3, 90000, 0.8, 240000, 60000],
    [3, 'C-300', 'Structure', 500000, 0.3, 150000, 0.2, 100000, 0.5, 250000, 250000],
  ];

  const linesStartRow = currentRow;
  lineItems.forEach((line) => {
    worksheet.getRow(currentRow).values = line;
    currentRow++;
  });
  const linesEndRow = currentRow - 1;

  // Apply styles to line items
  applyRangeStyle(worksheet, linesStartRow, linesEndRow, 1, 11, STYLES.tableCell);

  // Apply currency and percentage formatting
  applyCurrencyColumn(worksheet, 4, linesStartRow, linesEndRow); // Contract Value
  applyPercentageColumn(worksheet, 5, linesStartRow, linesEndRow); // Prev %
  applyCurrencyColumn(worksheet, 6, linesStartRow, linesEndRow); // Previous
  applyPercentageColumn(worksheet, 7, linesStartRow, linesEndRow); // This %
  applyCurrencyColumn(worksheet, 8, linesStartRow, linesEndRow); // This Period
  applyPercentageColumn(worksheet, 9, linesStartRow, linesEndRow); // Cum %
  applyCurrencyColumn(worksheet, 10, linesStartRow, linesEndRow); // Cumulative
  applyCurrencyColumn(worksheet, 11, linesStartRow, linesEndRow); // Remaining

  // Totals row
  const totalsRow = worksheet.getRow(currentRow);
  totalsRow.values = ['', '', 'TOTALS', 950000, '', 420000, '', 205000, '', 625000, 325000];
  applyRowStyle(totalsRow, STYLES.tableTotals);
  applyCurrencyColumn(worksheet, 4, currentRow, currentRow);
  applyCurrencyColumn(worksheet, 6, currentRow, currentRow);
  applyCurrencyColumn(worksheet, 8, currentRow, currentRow);
  applyCurrencyColumn(worksheet, 10, currentRow, currentRow);
  applyCurrencyColumn(worksheet, 11, currentRow, currentRow);
  currentRow += 3;

  // Summary section
  const summaryCell = worksheet.getCell(`A${currentRow}`);
  summaryCell.value = 'VALUATION SUMMARY';
  applyStyle(summaryCell, STYLES.sectionHeader);
  worksheet.mergeCells(`A${currentRow}:K${currentRow}`);
  currentRow++;

  currentRow = createSummarySection(worksheet, currentRow, 2, 4, [
    { label: 'Gross Valuation This Period', value: 205000, isCurrency: true },
    { label: 'Materials on Site', value: 10000, isCurrency: true },
    { label: 'Less Retention (5%)', value: -10750, isCurrency: true },
    { label: 'Less MCD (2.5%)', value: -5375, isCurrency: true },
    { label: 'Net Valuation', value: 198875, isCurrency: true },
    { label: 'Previous Payments', value: -420000, isCurrency: true },
    { label: 'Amount Due (excl VAT)', value: -221125, isCurrency: true },
    { label: 'VAT @ 20%', value: -44225, isCurrency: true },
    { label: 'TOTAL AMOUNT DUE', value: -265350, highlight: true, isCurrency: true },
  ]);

  // Save workbook
  await workbook.xlsx.writeFile('payment-application-styled.xlsx');
  console.log('Styled payment application created!');
}
```

---

## Testing

### Automated Test

Run the comprehensive test script:

```bash
node test-excel-styles.cjs
```

**Test Coverage**:
1. ✓ Verifies all 15 style definitions
2. ✓ Verifies all 4 column configurations
3. ✓ Tests all style application functions
4. ✓ Tests column configuration functions
5. ✓ Tests summary section creation
6. ✓ Creates sample Excel file with all features

**Output**: `test-excel-styles-output.xlsx` (verify in Excel)

---

## Best Practices

### 1. Use Predefined Styles

Always use `STYLES` constants instead of defining styles inline:

```typescript
// Good
applyStyle(cell, STYLES.currency);

// Bad
cell.numFmt = '£#,##0.00';
cell.alignment = { horizontal: 'right' };
```

### 2. Use Column Configurations

Use `COLUMN_CONFIGS` for standard layouts:

```typescript
// Good
applyColumnConfig(worksheet, COLUMN_CONFIGS.paymentApplication);
createHeaderRow(worksheet, COLUMN_CONFIGS.paymentApplication, 10);

// Bad
worksheet.getColumn(1).width = 5;
worksheet.getColumn(2).width = 12;
// ... repeat for all columns
```

### 3. Apply Range Styles Efficiently

Use range functions instead of looping through cells:

```typescript
// Good
applyRangeStyle(worksheet, 10, 50, 1, 11, STYLES.tableCell);

// Bad
for (let row = 10; row <= 50; row++) {
  for (let col = 1; col <= 11; col++) {
    applyStyle(worksheet.getCell(row, col), STYLES.tableCell);
  }
}
```

### 4. Use Helper Functions for Formatting

Use dedicated functions for currency/percentage columns:

```typescript
// Good
applyCurrencyColumn(worksheet, 4, 10, 50);
applyPercentageColumn(worksheet, 5, 10, 50);

// Bad
for (let row = 10; row <= 50; row++) {
  worksheet.getCell(row, 4).numFmt = '£#,##0.00';
  worksheet.getCell(row, 5).numFmt = '0.00%';
}
```

### 5. Consistent Summary Sections

Use `createSummarySection()` for consistent summary formatting:

```typescript
// Good
createSummarySection(worksheet, 50, 2, 4, summaryItems);

// Bad
// Manually creating label/value pairs with inconsistent styling
```

---

## Support

For issues or questions:
- Run test script: `node test-excel-styles.cjs`
- Check generated file: `test-excel-styles-output.xlsx`
- Review style definitions in `excelStyles.ts`
- Check ExcelJS documentation: https://github.com/exceljs/exceljs

## License

Internal use only - ConstructERP
