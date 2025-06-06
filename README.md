# Project Management Backend

This Express server uses Prisma with a PostgreSQL database for a simple project management API.

## Endpoints

### Projects
- `GET /projects` – list all projects
- `POST /projects` – create a new project
- `POST /upload-csv` – bulk upload projects from a CSV file

### Clients
- `GET /clients` – list all clients
- `GET /clients/:id` – fetch a client by id
- `POST /clients` – create a new client

### Tasks
- `GET /tasks` – list all tasks (includes the related project)
- `GET /tasks/:id` – get a single task
- `POST /tasks` – create a task (requires \`project_id\`)
- `PUT /tasks/:id` – update a task
- `DELETE /tasks/:id` – delete a task

The `/upload-csv` endpoint accepts an optional `tasks` column where task names are separated by semicolons. Any tasks provided are created and linked to the newly created project.

## Development

1. Update `prisma/schema.prisma` as needed and run migrations:

```bash
npx prisma migrate dev --name <migration-name>
```

2. Start the API:

```bash
node index.cjs
```
