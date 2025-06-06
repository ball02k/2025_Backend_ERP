# Project Management Backend

This Express server uses Prisma with a PostgreSQL database for a simple project management API.

## Endpoints

### Core Examples
- `GET /projects` – list all projects
- `POST /projects` – create a new project
- `GET /clients` – list all clients
- `GET /tasks` – list all tasks

For every model (companies, users, milestones, contacts, subtasks, comments, suppliers, procurements, compliance-records, cost-entries, cvr-reports, reports, files, project-team-members, audit-logs, ai-alerts) similar CRUD routes exist:

- `GET /<collection>`
- `GET /<collection>/:id`
- `POST /<collection>`
- `PUT /<collection>/:id`
- `DELETE /<collection>/:id`

CSV uploads are supported via `POST /upload-csv/:model` where `model` is one of the Prisma model keys (e.g. `project`, `supplier`). The original `/upload-csv` endpoint for projects remains available and accepts an optional `tasks` column where task names are separated by semicolons.

## Development

1. Update `prisma/schema.prisma` as needed and run migrations:

```bash
npx prisma migrate dev --name <migration-name>
```

2. Start the API:

```bash
node index.cjs
```
