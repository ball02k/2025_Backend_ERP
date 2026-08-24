# Export Layer Type System

## Overview

This directory contains comprehensive TypeScript type definitions for the Export Layer Architecture (Task 5.1 - Part 2).

The type system provides:
- Standardized internal data structures for payment applications
- Configuration interfaces for templates and field mappings
- Export request/response types
- Format-specific configuration (Excel, PDF, CSV)

## Type Definitions

### Core Data Types

- **`PaymentApplicationExportData`**: The canonical internal format for payment application data
  - All export templates transform FROM this standardized structure
  - Includes header, lines, summary, variations, dayworks, and certification sections

- **`PaymentApplicationLineExport`**: Line item structure with contract values, progress tracking, and grouping

- **`VariationExport`**: Variation/change order data

- **`DayworkExport`**: Daywork sheet data with labour, materials, and plant costs

### Template Configuration

- **`ExportTemplateConfig`**: Master template configuration
  - Format-specific settings (Excel, PDF, CSV)
  - Field mappings
  - Section inclusion flags
  - Branding options

- **`FieldMapping`**: Field transformation configuration
  - Maps source fields (dot notation) to target fields
  - Supports transformations (currency, date, percentage)
  - Format strings and default values

### Format-Specific Types

- **`ExcelTemplateConfig`**: Excel generation settings
  - Template file paths
  - Sheet names and ranges
  - Auto-fit and protection options

- **`PdfTemplateConfig`**: PDF generation settings
  - Page size and orientation
  - Margins
  - Header/footer templates

- **`CsvTemplateConfig`**: CSV generation settings
  - Delimiters and headers
  - Column order
  - Date and number formatting

### Request/Response Types

- **`ExportRequest`**: Export operation request
  - Category, source ID, template selection
  - Format overrides
  - Export options

- **`ExportOptions`**: Additional export options
  - Filename, attachments, watermarks
  - Password protection

- **`ExportResult`**: Export operation result
  - Success status
  - File metadata (URL, size, MIME type)
  - Error messages
  - Export log ID

## Usage

### In TypeScript Files

```typescript
import {
  PaymentApplicationExportData,
  ExportTemplateConfig,
  ExportRequest,
  ExportResult
} from './export/types';

// Use types for function signatures
async function exportPaymentApplication(
  data: PaymentApplicationExportData,
  config: ExportTemplateConfig
): Promise<ExportResult> {
  // Implementation
}
```

### In CommonJS Files (with JSDoc)

```javascript
/**
 * @typedef {import('./export/types').PaymentApplicationExportData} PaymentApplicationExportData
 * @typedef {import('./export/types').ExportResult} ExportResult
 */

/**
 * Export payment application
 * @param {PaymentApplicationExportData} data - Application data
 * @returns {Promise<ExportResult>} Export result
 */
async function exportPaymentApplication(data) {
  // Implementation
}
```

## Type Checking

The project includes npm scripts for type checking:

```bash
# Check types without emitting files
npm run types:check

# Build declaration files
npm run types:build
```

Declaration files are generated in the `dist/` directory and provide IntelliSense/autocomplete support in editors.

## Architecture Benefits

1. **Standardized Data Structure**: All templates transform from `PaymentApplicationExportData`, ensuring consistency
2. **Type Safety**: TypeScript types provide compile-time checking and editor support
3. **Flexibility**: Field mappings allow any output format without changing core data structures
4. **Extensibility**: Easy to add new formats by implementing format-specific config interfaces
5. **Documentation**: Types serve as living documentation of the data structures

## Integration with Existing Code

The existing CommonJS implementation in:
- `services/exportService.cjs`
- `services/generators/*.cjs`
- `routes/exports.cjs`

...now includes JSDoc type annotations that reference these TypeScript definitions, providing type checking and IntelliSense while maintaining CommonJS compatibility.

## Data Extractors

The `dataExtractor.ts` module provides functions to extract data from the database and transform it into the standardized export format.

### Available Extractors

- **`extractPaymentApplicationData(applicationId: number)`**: Extracts complete payment application data
  - Fetches application with all relations (project, lines, contract, supplier, certificate)
  - Transforms to `PaymentApplicationExportData` format
  - Handles JSON fields (variations, dayworks)
  - Builds complete address from client components
  - Safe percentage calculations

- **`extractCertificateData(certificateId: string)`**: Extracts payment certificate data
  - Returns standardized certificate export structure
  - Includes deductions (retention, MCD, CIS)
  - Payment tracking information

- **`extractCVRData(projectId: number, periodEnd: Date)`**: Extracts CVR report data
  - Cost breakdown by category
  - Value reconciliation
  - Margin calculations

### Usage Example

```typescript
import { extractPaymentApplicationData } from './export/dataExtractor';

// Extract payment application data
const exportData = await extractPaymentApplicationData(123);

// Use with export template
const buffer = await generatePaymentApplicationExcel(exportData, template);
```

## Architecture

```
Database → Data Extractor → Standardized Format → Template Transformer → Export Generator → File Buffer
```

1. **Data Extractor** queries database and produces `PaymentApplicationExportData`
2. **Template Transformer** (in exportService) applies field mappings
3. **Export Generator** (Excel/PDF/CSV) creates the final file

This separation ensures:
- Database schema changes don't affect templates
- Templates work with consistent data structure
- Easy to add new data sources or export formats

## Future Enhancements

Consider adding types for:
- DOCX template configuration
- JSON export options
- XML schema mappings
- Custom transformation functions
- Template validation schemas
- Additional data extractors (invoices, purchase orders, etc.)
