# CSV Templates and Import Notes

This backend exposes CSV export/import for Projects, Clients, and Tasks. All imports are tenant-scoped to the authenticated user, and writes require the appropriate permissions (role or project membership).

## Projects

- Export: `GET /api/projects/csv/export`
- Import: `POST /api/projects/csv/import` (roles: admin or pm)

Required columns:
- `code` (string)
- `name` (string)
- `clientId` (Int)

Optional columns:
- `description` (string)
- `status` (string)
- `type` (string)
- `statusId` (Int; validated)
- `typeId` (Int; validated)
- `startDate` (ISO datetime)
- `endDate` (ISO datetime)
- `budget` (number)
- `actualSpend` (number)

Example (header + 2 rows):
```
code,name,clientId,description,status,type,startDate,endDate,budget,actualSpend
P-001,Head Office Fitout,1,"HQ refresh","Active","Fit-out",2025-01-02T00:00:00Z,2025-09-30T00:00:00Z,1500000,250000
P-002,Warehouse Build,1,,Pending,General,,,,
```

Notes:
- `statusId`/`typeId` are validated when present.
- `code` is used to upsert within your tenant. If the same `code` exists in another tenant, the row is skipped.

## Clients

- Export: `GET /api/clients/csv/export`
- Import: `POST /api/clients/csv/import`

Required columns:
- `name` (string)

Optional columns:
- `id` (Int; update existing when present)
- `companyRegNo`, `vatNo`, `address1`, `address2`, `city`, `county`, `postcode`

Example:
```
name,companyRegNo,vatNo,address1,address2,city,county,postcode
Acme Construction,01234567,GB123456789,1 High St,,London,,W1
```

Notes:
- Import upserts by `id` (if provided) or by `name`.
- Clients are not tenant-partitioned; exports are filtered to clients with projects in your tenant.

## Tasks

- Export: `GET /api/tasks/csv/export`
- Import: `POST /api/tasks/csv/import` (membership required per `projectId`)

Required columns:
- `projectId` (Int)
- `title` (string)
- `statusId` (Int)

Optional columns:
- `id` (Int; update existing when present)
- `description` (string)
- `assignee` (string)
- `dueDate` (ISO datetime)

Example:
```
projectId,title,statusId,description,assignee,dueDate
1,"Foundation pour",1,,,
1,"Steel frame",1,Phase 1,John,2025-08-31T00:00:00Z
```

Notes:
- Each row requires project membership (admin bypass). Non-membership rows are skipped with reason `NOT_A_PROJECT_MEMBER`.
- All created/updated tasks are scoped to your tenant.

