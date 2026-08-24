# Template Registry Service (Task 5.2 - Part 3)

## Overview

The Template Registry Service manages export templates in the database, providing comprehensive functionality for seeding, retrieving, creating, updating, and customizing export templates. It supports multi-tenancy with system-wide templates and tenant-specific customizations.

**File**: `services/export/templateRegistry.ts`

**Purpose**: Database management for export templates with full lifecycle support

---

## Features

### ✅ Template Seeding
- Seeds 6 built-in templates (4 XLSX, 2 PDF)
- Idempotent operation (safe to run multiple times)
- Automatic create or update based on existing templates

### ✅ Template Retrieval
- Get templates by category and format
- Get default template with tenant → system fallback
- Get templates by Main Contractor
- Get template statistics

### ✅ Template Customization
- Create tenant-specific custom templates
- Duplicate existing templates for customization
- Update tenant templates
- Soft delete (isActive = false)

### ✅ Multi-Tenancy Support
- **SYSTEM** templates - Available to all tenants
- **TENANT** templates - Specific to one tenant
- **PROJECT** templates - Specific to one project (future)

### ✅ Main Contractor Support
- Templates can be associated with specific Main Contractors
- Retrieve all templates for a Main Contractor
- Supports MC-specific export requirements

---

## Built-in Templates

The service seeds 6 built-in templates into the database:

| Code | Name | Category | Format | Default | Sort |
|------|------|----------|--------|---------|------|
| `STD_APP_XLSX` | Standard Payment Application | PAYMENT_APPLICATION | XLSX | ⭐ Yes | 1 |
| `COMPACT_APP_XLSX` | Compact Payment Application | PAYMENT_APPLICATION | XLSX | No | 2 |
| `DETAILED_APP_XLSX` | Detailed Payment Application | PAYMENT_APPLICATION | XLSX | No | 3 |
| `SUBCON_APP_XLSX` | Subcontractor Payment Application | PAYMENT_APPLICATION | XLSX | No | 4 |
| `STD_APP_PDF` | Standard Payment Application (PDF) | PAYMENT_APPLICATION | PDF | ⭐ Yes | 10 |
| `COMPACT_APP_PDF` | Compact Payment Application (PDF) | PAYMENT_APPLICATION | PDF | No | 11 |

**Configuration Source**: Each template uses the corresponding pre-built configuration from `templates/defaultApplicationTemplate.ts`

---

## API Functions

### seedBuiltInTemplates()

Seeds all built-in templates to the database. This operation is idempotent and safe to run multiple times.

**Signature**:
```typescript
export async function seedBuiltInTemplates(): Promise<number>
```

**Returns**: Number of templates seeded

**Behavior**:
- Checks if each template already exists (by code + tenantId = null)
- If exists: Updates the template with latest configuration
- If not exists: Creates new template
- Logs success/failure for each template

**Example**:
```typescript
import { seedBuiltInTemplates } from './services/export/templateRegistry';

const count = await seedBuiltInTemplates();
console.log(`Seeded ${count} built-in templates`);
```

**Output**:
```
Seeding built-in export templates...
✓ Created template: Standard Payment Application
✓ Created template: Compact Payment Application
...
Seeded 6 built-in templates
```

---

### getTemplatesForCategory()

Retrieves all available templates for a specific category, including both system and tenant-specific templates.

**Signature**:
```typescript
export async function getTemplatesForCategory(
  tenantId: string,
  category: ExportCategory,
  format?: ExportFormat
): Promise<ExportTemplate[]>
```

**Parameters**:
- `tenantId` - Tenant ID for filtering tenant templates
- `category` - Export category to filter by
- `format` - Optional format to filter by (XLSX, PDF, etc.)

**Returns**: Array of templates ordered by default status, scope, sort order, and name

**Example**:
```typescript
const templates = await getTemplatesForCategory(
  'tenant-123',
  'PAYMENT_APPLICATION',
  'XLSX'
);

templates.forEach(t => {
  console.log(`${t.name} (${t.scope})`);
});
```

**Output**:
```
Standard Payment Application (SYSTEM)
Compact Payment Application (SYSTEM)
Detailed Payment Application (SYSTEM)
Subcontractor Payment Application (SYSTEM)
Custom Balfour Beatty Template (TENANT)
```

---

### getDefaultTemplate()

Gets the default template for a category and format, with tenant → system fallback.

**Signature**:
```typescript
export async function getDefaultTemplate(
  tenantId: string,
  category: ExportCategory,
  format: ExportFormat
): Promise<ExportTemplate | null>
```

**Resolution Order**:
1. Tenant-specific default template (scope = TENANT, isDefault = true)
2. System default template (scope = SYSTEM, isDefault = true)
3. null if none found

**Example**:
```typescript
const defaultTemplate = await getDefaultTemplate(
  'tenant-123',
  'PAYMENT_APPLICATION',
  'XLSX'
);

if (defaultTemplate) {
  console.log(`Using template: ${defaultTemplate.name}`);
} else {
  console.log('No default template found');
}
```

**Output**:
```
Found system default template: Standard Payment Application
Using template: Standard Payment Application
```

---

### createTenantTemplate()

Creates a custom template for a specific tenant.

**Signature**:
```typescript
export async function createTenantTemplate(
  tenantId: string,
  userId: string,
  data: {
    code: string;
    name: string;
    description?: string;
    category: ExportCategory;
    format: ExportFormat;
    config: ExportTemplateConfig;
    templateFileUrl?: string;
    mainContractorId?: string;
    mainContractorName?: string;
    isDefault?: boolean;
    sortOrder?: number;
  }
): Promise<ExportTemplate>
```

**Behavior**:
- If `isDefault` is true, unsets other defaults for same tenant/category/format
- Sets scope to 'TENANT'
- Stores config and fieldMappings
- Creates audit trail with userId

**Example**:
```typescript
import { defaultApplicationTemplate } from './templates/defaultApplicationTemplate';

const customTemplate = await createTenantTemplate(
  'tenant-123',
  'user-456',
  {
    code: 'CUSTOM_APP_V1',
    name: 'My Custom Payment Application',
    description: 'Custom template with company branding',
    category: 'PAYMENT_APPLICATION',
    format: 'XLSX',
    config: {
      ...defaultApplicationTemplate,
      branding: {
        primaryColor: '#FF5733',
        fontFamily: 'Arial',
      },
    },
    isDefault: true,
  }
);

console.log(`Created custom template: ${customTemplate.id}`);
```

---

### updateTenantTemplate()

Updates an existing tenant template.

**Signature**:
```typescript
export async function updateTenantTemplate(
  templateId: string,
  tenantId: string,
  data: Partial<{
    name: string;
    description: string;
    config: ExportTemplateConfig;
    templateFileUrl: string;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
  }>
): Promise<ExportTemplate>
```

**Security**:
- Verifies template belongs to tenant
- Only allows updating TENANT-scoped templates
- Throws error if template not found or doesn't belong to tenant

**Example**:
```typescript
const updated = await updateTenantTemplate(
  'template-id-123',
  'tenant-123',
  {
    name: 'Updated Template Name',
    isDefault: true,
  }
);

console.log(`Updated template: ${updated.name}`);
```

---

### duplicateTemplate()

Creates a copy of an existing template (system or tenant) as a new tenant template. Useful for customizing system templates.

**Signature**:
```typescript
export async function duplicateTemplate(
  templateId: string,
  tenantId: string,
  userId: string,
  newName: string,
  newCode?: string
): Promise<ExportTemplate>
```

**Behavior**:
- Copies all configuration from source template
- Creates new tenant-scoped template
- Generates unique code if not provided
- Sets `isDefault` to false (user can update later)
- Copies: config, fieldMappings, templateFileUrl, mainContractorId

**Example**:
```typescript
// Duplicate system template for customization
const systemTemplate = await getDefaultTemplate('tenant-123', 'PAYMENT_APPLICATION', 'XLSX');

const customized = await duplicateTemplate(
  systemTemplate.id,
  'tenant-123',
  'user-456',
  'Customized Standard Application',
  'CUSTOM_STD_APP'
);

// Now update the customized template
await updateTenantTemplate(customized.id, 'tenant-123', {
  config: {
    ...customized.config,
    excel: {
      ...customized.config.excel,
      currencySymbol: '$', // Change to dollars
    },
  },
});
```

---

### deleteTenantTemplate()

Soft deletes a tenant template by setting `isActive` to false. System templates cannot be deleted.

**Signature**:
```typescript
export async function deleteTenantTemplate(
  templateId: string,
  tenantId: string
): Promise<ExportTemplate>
```

**Security**:
- Verifies template belongs to tenant
- Only allows deleting TENANT-scoped templates
- Soft delete (sets isActive = false, doesn't physically remove)

**Example**:
```typescript
await deleteTenantTemplate('template-id-123', 'tenant-123');
console.log('Template deactivated');
```

---

### getTemplateById()

Retrieves a template by ID with optional access check.

**Signature**:
```typescript
export async function getTemplateById(
  templateId: string,
  tenantId?: string
): Promise<ExportTemplate | null>
```

**Access Control**:
- If `tenantId` provided: Only returns templates accessible to that tenant (SYSTEM or owned TENANT templates)
- If `tenantId` not provided: Returns any template

**Example**:
```typescript
const template = await getTemplateById('template-id-123', 'tenant-123');

if (template) {
  console.log(`Template: ${template.name}`);
  console.log(`Scope: ${template.scope}`);
} else {
  console.log('Template not found or not accessible');
}
```

---

### getMainContractorTemplates()

Gets all templates associated with a specific Main Contractor.

**Signature**:
```typescript
export async function getMainContractorTemplates(
  mainContractorId: string,
  category?: ExportCategory
): Promise<ExportTemplate[]>
```

**Use Case**: When a subcontractor is submitting an application to a Main Contractor (e.g., Balfour Beatty), retrieve the MC's specific template requirements.

**Example**:
```typescript
const mcTemplates = await getMainContractorTemplates(
  'mc-balfour-beatty',
  'PAYMENT_APPLICATION'
);

mcTemplates.forEach(t => {
  console.log(`${t.name} - ${t.format}`);
});
```

**Output**:
```
Balfour Beatty Payment Application - XLSX
Balfour Beatty Payment Certificate - PDF
```

---

### isTemplateCodeAvailable()

Checks if a template code is available for a tenant.

**Signature**:
```typescript
export async function isTemplateCodeAvailable(
  tenantId: string,
  code: string
): Promise<boolean>
```

**Use Case**: Validate code uniqueness before creating a new template.

**Example**:
```typescript
const isAvailable = await isTemplateCodeAvailable('tenant-123', 'MY_CUSTOM');

if (isAvailable) {
  console.log('Code is available');
} else {
  console.log('Code already exists for this tenant');
}
```

---

### getTemplateStatistics()

Gets statistics about templates, optionally filtered by tenant.

**Signature**:
```typescript
export async function getTemplateStatistics(tenantId?: string): Promise<{
  total: number;
  byCategory: Record<string, number>;
  byFormat: Record<string, number>;
  byScope: Record<string, number>;
}>
```

**Example**:
```typescript
const stats = await getTemplateStatistics('tenant-123');

console.log(`Total templates: ${stats.total}`);
console.log('By category:', stats.byCategory);
console.log('By format:', stats.byFormat);
console.log('By scope:', stats.byScope);
```

**Output**:
```
Total templates: 7
By category: { PAYMENT_APPLICATION: 7 }
By format: { XLSX: 5, PDF: 2 }
By scope: { SYSTEM: 6, TENANT: 1 }
```

---

## API Endpoints

### POST /api/export/templates/register-system

Seeds all built-in system templates into the database.

**Authentication**: Required (JWT)
**Authorization**: ADMIN, SUPER_ADMIN

**Request**:
```http
POST /api/export/templates/register-system
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully seeded 6 built-in system templates",
  "data": [
    {
      "id": "clx...",
      "code": "STD_APP_XLSX",
      "name": "Standard Payment Application",
      "category": "PAYMENT_APPLICATION",
      "format": "XLSX",
      "isDefault": true
    },
    ...
  ]
}
```

**Behavior**:
- Idempotent - safe to run multiple times
- Updates existing templates if they exist
- Creates new templates if they don't exist
- Returns all system templates after seeding

**Use Cases**:
- Initial system setup
- Updating templates after code changes
- Resetting templates to default configuration

---

### GET /api/export/templates

Get all available export templates for the authenticated tenant.

**Authentication**: Required (JWT)

**Query Parameters**:
- `category` (optional) - Filter by category (PAYMENT_APPLICATION, etc.)
- `format` (optional) - Filter by format (XLSX, PDF, etc.)
- `isActive` (optional) - Filter by active status (true/false)

**Request**:
```http
GET /api/export/templates?category=PAYMENT_APPLICATION&format=XLSX
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "code": "STD_APP_XLSX",
      "name": "Standard Payment Application",
      "category": "PAYMENT_APPLICATION",
      "format": "XLSX",
      "scope": "SYSTEM",
      "isDefault": true,
      "isActive": true,
      "sortOrder": 1
    },
    ...
  ]
}
```

---

### GET /api/export/templates/:id

Get a single template by ID.

**Authentication**: Required (JWT)

**Request**:
```http
GET /api/export/templates/clx...
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "code": "STD_APP_XLSX",
    "name": "Standard Payment Application",
    "config": { ... },
    "fieldMappings": [ ... ],
    ...
  }
}
```

---

### POST /api/export/templates

Create a custom tenant template.

**Authentication**: Required (JWT)

**Request**:
```http
POST /api/export/templates
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "CUSTOM_APP",
  "name": "My Custom Application",
  "description": "Custom payment application template",
  "category": "PAYMENT_APPLICATION",
  "format": "XLSX",
  "config": {
    "name": "My Custom Application",
    "version": "1.0",
    "sections": { ... },
    "excel": { ... },
    "fieldMappings": [ ... ]
  },
  "isDefault": false,
  "sortOrder": 100
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "code": "CUSTOM_APP",
    "name": "My Custom Application",
    "scope": "TENANT",
    ...
  }
}
```

---

### PATCH /api/export/templates/:id

Update a tenant template.

**Authentication**: Required (JWT)

**Request**:
```http
PATCH /api/export/templates/clx...
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Template Name",
  "isDefault": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "name": "Updated Template Name",
    ...
  }
}
```

---

### DELETE /api/export/templates/:id

Soft delete a tenant template (sets isActive = false).

**Authentication**: Required (JWT)

**Request**:
```http
DELETE /api/export/templates/clx...
Authorization: Bearer <token>
```

**Response**: 204 No Content

---

## Integration with Export Engine

The Export Engine automatically uses the template registry when exporting:

### Template Resolution Flow

```typescript
// User requests export without specifying template
const result = await executeExport(tenantId, userId, {
  category: 'PAYMENT_APPLICATION',
  sourceId: '123',
  format: 'XLSX',
});

// Export Engine resolves template in this order:
// 1. Check for tenant default template
const tenantDefault = await getDefaultTemplate(tenantId, 'PAYMENT_APPLICATION', 'XLSX');

// 2. If not found, use system default template
if (!tenantDefault) {
  const systemDefault = await prisma.exportTemplate.findFirst({
    where: { tenantId: null, scope: 'SYSTEM', category: 'PAYMENT_APPLICATION', format: 'XLSX', isDefault: true }
  });
}

// 3. If still not found, use built-in fallback from code
if (!systemDefault) {
  return getBuiltInTemplate('PAYMENT_APPLICATION', 'XLSX');
}
```

---

## Database Schema

```typescript
model ExportTemplate {
  id              String          @id @default(cuid())
  tenantId        String?         // Null for system templates

  // Identification
  name            String
  code            String          // Unique code
  description     String?

  // Classification
  category        ExportCategory
  format          ExportFormat
  scope           TemplateScope   // SYSTEM, TENANT, PROJECT

  // Configuration
  config          Json            // ExportTemplateConfig
  fieldMappings   Json            // FieldMapping[]
  templateFileUrl String?         // Optional template file

  // Main Contractor Association
  mainContractorId   String?
  mainContractorName String?

  // Metadata
  isDefault       Boolean         @default(false)
  isActive        Boolean         @default(true)
  sortOrder       Int             @default(0)
  createdBy       String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([tenantId, code])
}
```

**Key Points**:
- `tenantId` is null for system templates
- `@@unique([tenantId, code])` ensures unique codes per tenant
- `scope` distinguishes between SYSTEM, TENANT, and PROJECT templates
- `config` stores the full ExportTemplateConfig as JSON
- `fieldMappings` stores FieldMapping[] as JSON
- `isDefault` marks the default template for a category/format
- Soft delete via `isActive` flag

---

## Testing

### Manual Test Script

A comprehensive test script is provided: `test-template-registry.cjs`

**Run Test**:
```bash
node test-template-registry.cjs
```

**Test Coverage**:
1. ✓ Seeds built-in templates
2. ✓ Verifies templates in database
3. ✓ Tests getDefaultTemplate()
4. ✓ Tests getTemplatesForCategory()
5. ✓ Tests getTemplateStatistics()
6. ✓ Tests idempotency (re-seeding)

**Expected Output**:
```
🧪 Testing Template Registry Service
============================================================

📦 Step 1: Seeding built-in templates...
✓ Created template: Standard Payment Application
✓ Created template: Compact Payment Application
✓ Created template: Detailed Payment Application
✓ Created template: Subcontractor Payment Application
✓ Created template: Standard Payment Application (PDF)
✓ Created template: Compact Payment Application (PDF)
Seeded 6 built-in templates
✓ Seeded 6 built-in templates

🔍 Step 2: Verifying templates in database...
Found 6 system templates:
  ⭐ STD_APP_XLSX         | Standard Payment Application             | XLSX
     COMPACT_APP_XLSX     | Compact Payment Application              | XLSX
     DETAILED_APP_XLSX    | Detailed Payment Application             | XLSX
     SUBCON_APP_XLSX      | Subcontractor Payment Application        | XLSX
  ⭐ STD_APP_PDF          | Standard Payment Application (PDF)       | PDF
     COMPACT_APP_PDF      | Compact Payment Application (PDF)        | PDF

🎯 Step 3: Testing getDefaultTemplate()...
Found system default template: Standard Payment Application
✓ Default XLSX template: Standard Payment Application
Found system default template: Standard Payment Application (PDF)
✓ Default PDF template: Standard Payment Application (PDF)

📋 Step 4: Testing getTemplatesForCategory()...
Found 4 XLSX templates for PAYMENT_APPLICATION:
  ⭐ Standard Payment Application
     Compact Payment Application
     Detailed Payment Application
     Subcontractor Payment Application

📊 Step 5: Testing getTemplateStatistics()...
Total templates: 6
By category: { PAYMENT_APPLICATION: 6 }
By format: { XLSX: 4, PDF: 2 }
By scope: { SYSTEM: 6 }

🔁 Step 6: Testing idempotency (seeding again)...
✓ Updated template: Standard Payment Application
...
Total system templates after re-seed: 6
✓ Count unchanged (idempotent)

============================================================
✅ All tests completed successfully!
============================================================
```

### API Testing

**Test Template Seeding**:
```bash
# Seed system templates (requires admin token)
curl -X POST http://localhost:3001/api/export/templates/register-system \
  -H "Authorization: Bearer <admin-token>" \
  | jq
```

**Test Template Retrieval**:
```bash
# Get all templates
curl http://localhost:3001/api/export/templates \
  -H "Authorization: Bearer <token>" \
  | jq

# Get XLSX templates only
curl "http://localhost:3001/api/export/templates?format=XLSX" \
  -H "Authorization: Bearer <token>" \
  | jq
```

---

## Troubleshooting

### Templates Not Seeding

**Problem**: `seedBuiltInTemplates()` returns 0

**Possible Causes**:
- Database connection issue
- Prisma schema not migrated
- Errors caught and logged

**Solution**:
```bash
# Check database connection
npm run db:status

# Run migrations
npx prisma migrate deploy

# Check logs for specific errors
```

### Duplicate Template Errors

**Problem**: "Template with code 'XXX' already exists"

**Cause**: Attempting to create a template with a code that already exists for the tenant

**Solution**:
- Use `isTemplateCodeAvailable()` before creating
- Choose a different code
- Update existing template instead

### Template Not Found

**Problem**: `getDefaultTemplate()` returns null

**Possible Causes**:
- No default template set for category/format
- Templates not seeded
- All templates deactivated

**Solution**:
```typescript
// Check if templates exist
const stats = await getTemplateStatistics();
console.log(stats);

// Re-seed if needed
await seedBuiltInTemplates();

// Set a template as default
await updateTenantTemplate(templateId, tenantId, { isDefault: true });
```

---

## Best Practices

### 1. Seed Templates on Deployment

Add template seeding to your deployment script:

```bash
# In deploy.sh or CI/CD pipeline
node -e "require('./dist/services/export/templateRegistry').seedBuiltInTemplates()"
```

### 2. Use Default Templates

Always provide a default template for each category/format:

```typescript
// Good: Ensure there's a default
const template = await getDefaultTemplate(tenantId, 'PAYMENT_APPLICATION', 'XLSX');
if (!template) {
  await seedBuiltInTemplates();
  template = await getDefaultTemplate(tenantId, 'PAYMENT_APPLICATION', 'XLSX');
}
```

### 3. Duplicate Before Customizing

Don't modify system templates. Duplicate and customize instead:

```typescript
// Good: Duplicate system template for customization
const systemTemplate = await getTemplateById('system-template-id');
const customTemplate = await duplicateTemplate(
  systemTemplate.id,
  tenantId,
  userId,
  'Customized Template'
);

await updateTenantTemplate(customTemplate.id, tenantId, {
  config: customizedConfig,
});
```

### 4. Validate Template Codes

Always check code availability:

```typescript
// Good: Validate before creating
if (await isTemplateCodeAvailable(tenantId, newCode)) {
  await createTenantTemplate(tenantId, userId, templateData);
} else {
  throw new Error('Template code already exists');
}
```

### 5. Soft Delete Only

Never hard delete templates:

```typescript
// Good: Soft delete
await deleteTenantTemplate(templateId, tenantId);

// Bad: Hard delete
await prisma.exportTemplate.delete({ where: { id: templateId } });
```

---

## Future Enhancements

### Planned Features
- [ ] Template versioning (v1, v2, etc.)
- [ ] Template inheritance (extend from parent template)
- [ ] Template approval workflow
- [ ] Template sharing between tenants
- [ ] Template marketplace
- [ ] Template preview generation
- [ ] Template validation rules
- [ ] Bulk template operations
- [ ] Template import/export (JSON)
- [ ] Template usage analytics

### Main Contractor Templates
- [ ] Balfour Beatty standard templates
- [ ] Kier standard templates
- [ ] Skanska standard templates
- [ ] Morgan Sindall standard templates
- [ ] Willmott Dixon standard templates

---

## Support

For issues or questions:
- Check test script output: `node test-template-registry.cjs`
- Review Prisma schema: `prisma/schema.prisma`
- Check API endpoints: `routes/export.ts`
- Review pre-built templates: `services/export/templates/defaultApplicationTemplate.ts`

## License

Internal use only - ConstructERP
