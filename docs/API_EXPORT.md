# Export API Documentation

## Overview

The Export API provides a flexible, template-based system for exporting payment applications, certificates, and other financial data into various formats (Excel, PDF, CSV). The system uses an orchestration layer (ExportEngine) that coordinates data extraction, transformation, and file generation.

**Base URL**: `/api/export`
**Authentication**: All endpoints require authentication via `requireAuth` middleware

---

## Architecture

The export system follows a clean, layered architecture:

```
Database → Data Extractor → Standardized Format → Template → Generator → Storage
```

1. **Data Extractor** - Fetches data from database and transforms to standardized format
2. **Template System** - Defines field mappings and formatting rules
3. **Generators** - Format-specific engines (Excel, PDF, CSV)
4. **Storage** - Uploads to local/cloud storage
5. **Logging** - Complete audit trail of all exports

---

## Endpoints

### 1. Execute Export

**POST** `/api/export`

Execute an export operation using a template or default settings.

#### Request Body

```json
{
  "category": "PAYMENT_APPLICATION",
  "sourceId": "123",
  "templateId": "template-uuid-here",
  "format": "XLSX",
  "options": {
    "filename": "custom-filename.xlsx",
    "includeAttachments": true,
    "includeSupportingDocs": false,
    "watermark": "DRAFT",
    "password": "optional-password"
  }
}
```

**Fields**:
- `category` (required): Export category
  - `PAYMENT_APPLICATION` - Payment application
  - `PAYMENT_CERTIFICATE` - Payment certificate
  - `CVR_REPORT` - Cost/Value Reconciliation report
  - `VALUATION` - Valuation
  - `INVOICE` - Invoice
  - `RETENTION_STATEMENT` - Retention statement
  - `AGED_RECEIVABLES` - Aged receivables report
- `sourceId` (required): ID of the record to export
- `templateId` (optional): Specific template ID, or use default template
- `format` (optional): Override template format (`XLSX`, `PDF`, `CSV`, `JSON`, `XML`)
- `options` (optional): Export options
  - `filename`: Custom filename
  - `includeAttachments`: Include attachments
  - `includeSupportingDocs`: Include supporting documents
  - `watermark`: Watermark text
  - `password`: Password protection (if supported by format)

#### Response

**Success (200)**:
```json
{
  "success": true,
  "fileUrl": "https://storage.example.com/exports/application-123.xlsx",
  "fileName": "application-123.xlsx",
  "fileSize": 45678,
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "exportLogId": "log-uuid-here"
}
```

**Error (400)**:
```json
{
  "success": false,
  "error": "Template not found"
}
```

**Validation Error (400)**:
```json
{
  "error": "Validation error",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["category"],
      "message": "Required"
    }
  ]
}
```

---

### 2. Download Export

**POST** `/api/export/download`

Execute export and immediately redirect to download URL.

#### Request Body

Same as `/api/export` endpoint.

#### Response

**Success**: HTTP 302 redirect to file download URL
**Error (400)**: JSON error response

---

### 3. List Templates

**GET** `/api/export/templates`

Get available export templates for the current tenant.

#### Query Parameters

- `category` (optional): Filter by category (e.g., `PAYMENT_APPLICATION`)
- `format` (optional): Filter by format (e.g., `XLSX`, `PDF`)
- `isActive` (optional): Filter by active status (`true` or `false`)

#### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "template-uuid-1",
      "name": "Standard Payment Application",
      "code": "STD_PAYMENT_APP",
      "description": "Standard payment application format",
      "category": "PAYMENT_APPLICATION",
      "format": "XLSX",
      "scope": "SYSTEM",
      "config": {
        "name": "Standard Payment Application",
        "version": "1.0",
        "excel": {
          "sheetName": "Application",
          "autoFit": true,
          "currencySymbol": "£"
        },
        "sections": {
          "header": true,
          "lines": true,
          "summary": true,
          "variations": true,
          "dayworks": false,
          "certification": false
        }
      },
      "isActive": true,
      "isDefault": true,
      "sortOrder": 0,
      "tenantId": null,
      "createdBy": "system",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 4. Get Template

**GET** `/api/export/templates/:id`

Get a specific template by ID.

#### Response

```json
{
  "success": true,
  "data": {
    "id": "template-uuid-1",
    "name": "Standard Payment Application",
    "code": "STD_PAYMENT_APP",
    "category": "PAYMENT_APPLICATION",
    "format": "XLSX",
    "config": { /* template configuration */ },
    "fieldMappings": { /* field mappings */ }
  }
}
```

**Error (404)**:
```json
{
  "success": false,
  "error": "Template not found"
}
```

---

### 5. Create Template

**POST** `/api/export/templates`

Create a custom export template.

#### Request Body

```json
{
  "name": "Custom Payment Application",
  "code": "CUSTOM_PAYMENT_APP",
  "description": "Custom payment application format for XYZ Main Contractor",
  "category": "PAYMENT_APPLICATION",
  "format": "XLSX",
  "scope": "TENANT",
  "config": {
    "name": "Custom Payment Application",
    "version": "1.0",
    "excel": {
      "sheetName": "Application",
      "startRow": 10,
      "autoFit": true,
      "currencySymbol": "£"
    },
    "sections": {
      "header": true,
      "lines": true,
      "summary": true,
      "variations": true,
      "dayworks": false,
      "certification": false
    },
    "branding": {
      "logoUrl": "https://example.com/logo.png",
      "primaryColor": "#003366"
    }
  },
  "fieldMappings": {
    "header.applicationNumber": {
      "targetField": "B5",
      "format": "number"
    },
    "header.projectName": {
      "targetField": "B6",
      "format": "text"
    }
  },
  "isActive": true,
  "isDefault": false,
  "sortOrder": 10,
  "mainContractorId": "mc-uuid-here",
  "mainContractorName": "XYZ Construction Ltd"
}
```

**Required Fields**:
- `name`: Template name
- `code`: Unique template code
- `category`: Export category
- `format`: Export format
- `config`: Template configuration object
- `fieldMappings`: Field mapping configuration

**Optional Fields**:
- `description`: Template description
- `scope`: Template scope (`SYSTEM`, `TENANT`, `PROJECT`) - defaults to `TENANT`
- `isActive`: Active status - defaults to `true`
- `isDefault`: Default template flag - defaults to `false`
- `sortOrder`: Sort order - defaults to `0`
- `mainContractorId`: Associated main contractor ID
- `mainContractorName`: Main contractor name

#### Response

**Success (201)**:
```json
{
  "success": true,
  "data": {
    "id": "new-template-uuid",
    "name": "Custom Payment Application",
    "code": "CUSTOM_PAYMENT_APP",
    "category": "PAYMENT_APPLICATION",
    "format": "XLSX",
    "tenantId": "tenant-uuid",
    "createdBy": "user-uuid",
    "createdAt": "2025-12-08T10:00:00.000Z"
  }
}
```

**Validation Error (400)**:
```json
{
  "error": "Validation error",
  "details": [ /* validation errors */ ]
}
```

---

### 6. Update Template

**PATCH** `/api/export/templates/:id`

Update an existing template.

#### Request Body

Any fields from the create template request (partial update supported).

**Note**: The following fields cannot be updated:
- `id`
- `tenantId`
- `createdBy`
- `createdAt`

#### Response

```json
{
  "success": true,
  "data": {
    "id": "template-uuid",
    "name": "Updated Template Name",
    "updatedAt": "2025-12-08T11:00:00.000Z"
  }
}
```

---

### 7. Delete Template

**DELETE** `/api/export/templates/:id`

Delete a template (soft delete - sets `isActive` to `false`).

#### Response

**Success (204)**: No content

**Error (404)**:
```json
{
  "error": "Template not found"
}
```

---

### 8. Export History

**GET** `/api/export/history`

Get export history for the current tenant.

#### Query Parameters

- `category` (optional): Filter by category
- `sourceId` (optional): Filter by source ID
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

#### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "log-uuid-1",
      "tenantId": "tenant-uuid",
      "category": "PAYMENT_APPLICATION",
      "sourceId": "123",
      "format": "XLSX",
      "status": "SUCCESS",
      "fileUrl": "https://storage.example.com/exports/application-123.xlsx",
      "fileName": "application-123.xlsx",
      "fileSize": 45678,
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "exportedBy": "user-uuid",
      "exportedAt": "2025-12-08T10:30:00.000Z",
      "template": {
        "id": "template-uuid",
        "name": "Standard Payment Application",
        "code": "STD_PAYMENT_APP"
      }
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### 9. Get Export Log

**GET** `/api/export/history/:id`

Get a specific export log entry.

#### Response

```json
{
  "success": true,
  "data": {
    "id": "log-uuid-1",
    "tenantId": "tenant-uuid",
    "category": "PAYMENT_APPLICATION",
    "sourceId": "123",
    "format": "XLSX",
    "status": "SUCCESS",
    "fileUrl": "https://storage.example.com/exports/application-123.xlsx",
    "fileName": "application-123.xlsx",
    "fileSize": 45678,
    "exportedBy": "user-uuid",
    "exportedAt": "2025-12-08T10:30:00.000Z",
    "template": {
      "id": "template-uuid",
      "name": "Standard Payment Application",
      "code": "STD_PAYMENT_APP",
      "config": { /* full template config */ }
    }
  }
}
```

**Error (404)**:
```json
{
  "success": false,
  "error": "Export log not found"
}
```

---

### 10. Register System Templates

**POST** `/api/export/templates/register-system`

Register all system templates. **Admin only**.

#### Authorization

Requires one of the following roles:
- `ADMIN`
- `SUPER_ADMIN`

#### Response

**Success (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "template-uuid-1",
      "name": "Standard Payment Application",
      "code": "STD_PAYMENT_APP"
    },
    {
      "id": "template-uuid-2",
      "name": "JCT Payment Application",
      "code": "JCT_PAYMENT_APP"
    }
  ],
  "message": "Registered 2 system templates"
}
```

**Error (401)**:
```json
{
  "error": "Unauthorized"
}
```

**Error (403)**:
```json
{
  "error": "Forbidden - Admin access required"
}
```

---

## Convenience Endpoints for Applications

These endpoints provide quick access to export functionality directly from the project/application context. They are nested under the projects API and automatically handle tenant validation and project access.

**Base URL**: `/api/projects/:projectId/applications`

### 11. Export Application

**GET** `/api/projects/:projectId/applications/:applicationId/export`

Quick export endpoint for payment applications.

#### Path Parameters

- `projectId`: Project ID
- `applicationId`: Application for payment ID

#### Query Parameters

- `format` (optional): Export format (`XLSX`, `PDF`, `CSV`) - default: `XLSX`
- `templateId` (optional): Specific template ID to use

#### Response

**Success (200)**:
```json
{
  "success": true,
  "fileUrl": "/uploads/payment_application_1_20251208.xlsx",
  "fileName": "payment_application_1_20251208.xlsx",
  "fileSize": 18523,
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "exportLogId": "cmix34mhy0000emg3669fclul"
}
```

**Error (404)**:
```json
{
  "error": "Application not found"
}
```

**Error (400)**:
```json
{
  "error": "Export failed: [error message]"
}
```

#### Example

```bash
# Export to Excel (default)
curl -X GET "http://localhost:3001/api/projects/1/applications/123/export" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Export to PDF
curl -X GET "http://localhost:3001/api/projects/1/applications/123/export?format=PDF" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Export with specific template
curl -X GET "http://localhost:3001/api/projects/1/applications/123/export?format=XLSX&templateId=template-uuid" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 12. Download Application Export

**GET** `/api/projects/:projectId/applications/:applicationId/export/download`

Direct download endpoint - immediately redirects to file URL for browser download.

#### Path Parameters

- `projectId`: Project ID
- `applicationId`: Application for payment ID

#### Query Parameters

- `format` (optional): Export format (`XLSX`, `PDF`, `CSV`) - default: `XLSX`
- `templateId` (optional): Specific template ID to use

#### Response

**Success**: HTTP 302 redirect to file download URL

**Error (404)**:
```json
{
  "error": "Application not found"
}
```

**Error (400)**:
```json
{
  "error": "Export failed: [error message]"
}
```

#### Example

```bash
# Download Excel file
curl -L "http://localhost:3001/api/projects/1/applications/123/export/download" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o application_123.xlsx

# Download PDF
curl -L "http://localhost:3001/api/projects/1/applications/123/export/download?format=PDF" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o application_123.pdf
```

---

### 13. Get Available Templates for Application

**GET** `/api/projects/:projectId/applications/:applicationId/export/templates`

Get all templates available for exporting this application.

Returns templates that are:
- Active
- Category `PAYMENT_APPLICATION`
- SYSTEM scope (available to all tenants)
- TENANT scope (tenant-specific)
- Main Contractor specific (if project has upstream contract)

#### Path Parameters

- `projectId`: Project ID
- `applicationId`: Application for payment ID

#### Response

**Success (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "template-uuid-1",
      "name": "Standard Payment Application",
      "code": "STD_PAYMENT_APP",
      "description": "Standard payment application format",
      "category": "PAYMENT_APPLICATION",
      "format": "XLSX",
      "scope": "SYSTEM",
      "isDefault": true,
      "mainContractorId": null,
      "mainContractorName": null,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    },
    {
      "id": "template-uuid-2",
      "name": "Balfour Beatty Payment Application",
      "code": "BB_PAYMENT_APP",
      "description": "Balfour Beatty specific format",
      "category": "PAYMENT_APPLICATION",
      "format": "XLSX",
      "scope": "SYSTEM",
      "isDefault": false,
      "mainContractorId": "mc-bb-uuid",
      "mainContractorName": "Balfour Beatty",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

**Error (404)**:
```json
{
  "error": "Application not found"
}
```

#### Example

```bash
curl -X GET "http://localhost:3001/api/projects/1/applications/123/export/templates" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Template Configuration

### Template Scope

Templates have three scope levels:

1. **SYSTEM** - Built-in templates available to all tenants
2. **TENANT** - Custom templates created by a tenant
3. **PROJECT** - Project-specific templates

### Template Resolution Order

When no `templateId` is specified, the system resolves templates in this order:

1. Default TENANT template for the category/format
2. Default SYSTEM template for the category/format
3. Built-in fallback template

### Field Mappings

Field mappings define how data from the standardized internal format maps to the output format:

```json
{
  "sourceField": "header.applicationNumber",
  "targetField": "B5",
  "transform": "number",
  "format": "0000",
  "defaultValue": 0
}
```

**Properties**:
- `sourceField`: Path in internal data (dot notation)
- `targetField`: Cell reference (Excel) or field name
- `transform`: Optional transformation (`currency`, `date`, `percentage`, `number`)
- `format`: Format string (e.g., `dd/MM/yyyy` for dates)
- `defaultValue`: Default value if source is null/undefined

---

## Format-Specific Configuration

### Excel (XLSX)

```json
{
  "excel": {
    "templateFile": "path/to/template.xlsx",
    "sheetName": "Application",
    "startRow": 10,
    "lineItemsRange": "A15:K",
    "autoFit": true,
    "protectSheet": false,
    "currencySymbol": "£"
  }
}
```

### PDF

```json
{
  "pdf": {
    "pageSize": "A4",
    "orientation": "portrait",
    "margins": {
      "top": 50,
      "right": 50,
      "bottom": 50,
      "left": 50
    },
    "headerTemplate": "<div>Header HTML</div>",
    "footerTemplate": "<div>Footer HTML</div>",
    "footerText": "Generated by ERP System",
    "currencySymbol": "£"
  }
}
```

### CSV

```json
{
  "csv": {
    "delimiter": ",",
    "includeHeaders": true,
    "columns": ["line", "description", "value"],
    "dateFormat": "yyyy-MM-dd",
    "numberFormat": "0.00"
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `TEMPLATE_NOT_FOUND` | 400 | Specified template not found |
| `SOURCE_NOT_FOUND` | 400 | Source record not found |
| `UNSUPPORTED_CATEGORY` | 400 | Export category not supported |
| `UNSUPPORTED_FORMAT` | 400 | Export format not supported |
| `EXPORT_FAILED` | 400 | Export generation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Examples

### Export Payment Application to Excel

```bash
curl -X POST http://localhost:3001/api/export \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "category": "PAYMENT_APPLICATION",
    "sourceId": "123",
    "format": "XLSX"
  }'
```

### Export with Custom Template

```bash
curl -X POST http://localhost:3001/api/export \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "category": "PAYMENT_APPLICATION",
    "sourceId": "123",
    "templateId": "template-uuid-here",
    "options": {
      "watermark": "DRAFT"
    }
  }'
```

### Create Custom Template

```bash
curl -X POST http://localhost:3001/api/export/templates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Custom Payment App",
    "code": "CUSTOM_PA_001",
    "category": "PAYMENT_APPLICATION",
    "format": "XLSX",
    "config": {
      "name": "Custom Payment App",
      "version": "1.0",
      "sections": {
        "header": true,
        "lines": true,
        "summary": true,
        "variations": true,
        "dayworks": false,
        "certification": false
      }
    },
    "fieldMappings": {}
  }'
```

---

## TypeScript Types

The export system provides comprehensive TypeScript type definitions in `services/export/types.ts`:

```typescript
import {
  ExportRequest,
  ExportResult,
  ExportOptions,
  PaymentApplicationExportData,
  ExportTemplateConfig
} from './services/export/types';
```

See `services/export/README.md` for detailed type documentation.

---

## Migration Guide

### From Old API (`/api/exports`)

The new TypeScript-based export API (`/api/export`) provides the same functionality with improved type safety and orchestration:

| Old Endpoint | New Endpoint | Notes |
|--------------|--------------|-------|
| `POST /api/exports` | `POST /api/export` | Same functionality |
| `GET /api/exports/templates` | `GET /api/export/templates` | Same response format |
| `POST /api/exports/templates` | `POST /api/export/templates` | Enhanced validation |

Both APIs are available during the transition period.

---

## Support

For issues or questions:
- Check the type definitions in `services/export/types.ts`
- Review the README in `services/export/README.md`
- Check export logs via `GET /api/export/history`
