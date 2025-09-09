# Backend ERP

## Development

Install dependencies and start the dev server:

```
npm ci
npm run dev
```

### One-command Dev (API + DB + Frontend)

If the frontend repo lives alongside this backend as `../2025_ERP`, you can launch everything together:

```
npm run dev:all
```

This will:
- Start Postgres via Docker
- Run `prisma generate` and `migrate deploy`
- Seed demo data (idempotent)
- Start the API on `:3001`
- Start the Vite dev server on `:5173` (proxying `/api` to the backend)

Then open: `http://localhost:5173`

### Database (Postgres)

This repo uses Postgres via Prisma. By default, `DATABASE_URL` points to `localhost:5432`.

- Quick start with Docker (recommended):

```
docker compose up -d db

# wait for healthy DB, then initialise schema and demo data
npm run prisma:generate
npm run prisma:deploy
npm run seed:demo
```

- Or use your own Postgres instance and update `DATABASE_URL` in `.env` accordingly.

Common forms of `DATABASE_URL`:

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

Verify connectivity:

```
npm run prisma:validate
node scripts/check-db.cjs
```

Check server health:

```
npm run health
```

### Environment
- `DEV_AUTH_BYPASS`:
  - Development default: enabled when `NODE_ENV !== 'production'`.
  - Explicit control: set `DEV_AUTH_BYPASS=false` to disable, or `true` to force-enable (still ignored in production).
  - Legacy alias: `ENABLE_DEV_AUTH=1` is also accepted.
  - Never enable in production environments.
- See `.env.example` for other variables and defaults.
- `COMPANIES_HOUSE_API_KEY`: API key for Companies House lookup service.
- `HMRC_VAT_API_KEY`: API key for HMRC VAT validation service.

### Dev Auth Bypass
- When active: automatically in development, or when `DEV_AUTH_BYPASS=true` (never in production). Set `DEV_AUTH_BYPASS=false` to disable.
- Behavior: if no `Authorization: Bearer` token is present, middleware attaches a dev user with `tenantId` from `X-Tenant-Id` or `demo`.
- Headers: real tokens and `X-Tenant-Id` are honored; header can override tenant in dev.
- Never enable in production.

Quick test (no token):
```
export DEV_AUTH_BYPASS=true
npm run dev
curl -i http://localhost:3001/api/projects
```

### Dev Login (JWT)
- Endpoint: `POST /api/dev/login?tenant=demo` (dev only; mounted when `NODE_ENV !== 'production'`).
- Returns: `{ token, tenant }`. Use headers `Authorization: Bearer <token>` and `X-Tenant-Id: <tenant>`.
- Default tenant: `TENANT_DEFAULT=demo`.

Quick test:
```
curl -s -X POST "http://localhost:3001/api/dev/login?tenant=demo" | jq .
```
Then call a protected route:
```
TOKEN=$(curl -s -X POST "http://localhost:3001/api/dev/login?tenant=demo" | jq -r '.token')
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: demo" \
  "http://localhost:3001/api/projects?limit=1" | jq .
```

### Dev Token (auto-seed) — Recommended for FE
- Endpoint: `GET /api/dev-token` (dev only; enabled when dev auth is active).
- Behavior: returns `{ token, user }`. If a demo user/role is missing, it auto-creates:
  - Tenant: `demo` (override via `DEMO_TENANT_ID`)
  - User: `admin@demo.local` (override via `DEMO_USER_EMAIL`)
  - Role: `admin` linked to the user
- Auth embed: token includes `tenantId=demo`, so `X-Tenant-Id` is optional.
- Disabled in production: returns `403` when `NODE_ENV === 'production'` or dev auth disabled.

Quick test:
```
curl -s http://localhost:3001/api/dev-token | jq .
TOKEN=$(curl -s http://localhost:3001/api/dev-token | jq -r '.token')
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/projects?limit=1" | jq .
```

Env flags and defaults:
- `NODE_ENV=development` enables dev-only routes.
- `DEV_AUTH_BYPASS=true` (default in dev) keeps dev auth tooling enabled; set `false` to disable.
- `ENABLE_DEV_AUTH` is a legacy alias; either variable works.
- `DEMO_TENANT_ID=demo`, `DEMO_USER_EMAIL=admin@demo.local` can be customized.
- `JWT_SECRET` sets the signing secret (default: `dev_secret`).

## Variations Smoke Test

With the dev server running, exercise the variations API:

```
node scripts/variations-smoke.mjs
```

## Documents module (local uploads or S3 presign)

Env (local default):
STORAGE_PROVIDER=local
UPLOAD_TOKEN_SECRET=dev-secret

# S3 (optional):
# STORAGE_PROVIDER=s3
# S3_BUCKET=your-bucket
# S3_REGION=eu-west-2
# S3_ACCESS_KEY_ID=xxx
# S3_SECRET_ACCESS_KEY=yyy

### Flow (local)
1) INIT
TOKEN=$(curl -s -X POST http://localhost:3001/api/dev/login | jq -r '.token')
INIT=$(curl -s -X POST http://localhost:3001/api/documents/init \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"filename":"hello.txt","mimeType":"text/plain"}')
KEY=$(echo "$INIT" | jq -r '.data.storageKey'); URL=$(echo "$INIT" | jq -r '.data.uploadUrl')

2) UPLOAD (stream body)
echo "hello world" | curl -s -X PUT --data-binary @- "http://localhost:3001$URL" | jq .

3) COMPLETE (record metadata + link to project 1)
curl -s -X POST http://localhost:3001/api/documents/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"storageKey\":\"$KEY\",\"filename\":\"hello.txt\",\"mimeType\":\"text/plain\",\"size\":11,\"projectId\":1}" | jq .

4) LIST
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/documents?projectId=1&limit=5" | jq '.meta, .data[].filename'

# Setup
nvm use
bash scripts/clean_install.sh
npm run prisma:validate
npm run prisma:deploy
npm run seed:demo
npm run dev
# optional: npm run smoke:variations / npm run smoke:docs (with server running)

## Variations API

- Base: `/api/variations`
- Auth: Bearer token required; tenant from `attachUser`; project membership enforced on project-scoped routes.

Endpoints:
- GET `/api/variations?projectId=&status=&type=&q=&limit=&offset=`
  - Filters by `tenantId` and required `projectId`.
  - `q` searches title/reference/reason/notes.
- GET `/api/variations/:id`
  - Returns variation with `lines`.
- POST `/api/variations`
  - Body: `{ projectId, title, reference?, contractType, status, type, reason?, submissionDate?, decisionDate?, value, costImpact, timeImpactDays?, notes?, lines?: [{ description, qty, rate, value, sort? }] }`
- PUT `/api/variations/:id`
  - Replace-all strategy for `lines`.
- DELETE `/api/variations/:id`
  - Hard delete; enforces tenant + membership.

Project Overview read-model includes quick counts under `widgets.variations`:
- `total`, `approved`, `pending` (plus legacy `draft/submitted/approved/valueApproved`).

## Manual Test Checklist

- `npm run dev` boots backend with no new deps.
- `npx prisma migrate dev` then `npx prisma generate` succeed.
- Create variation with lines; list, filter by status/type/q; update lines (replace-all); delete.
- Access control: user from another tenant cannot see/modify.
- Decimal values return as strings; no JSON BigInt crashes.
- `node scripts/audit_backend.js` passes.

## Frontend

Set `VITE_API_BASE_URL=http://localhost:3001` (or proxy `/api` to `3001`) so frontend fetches hit the backend.

Notes on ports:
- Backend API: `3001` (change via `PORT` in `.env`)
- Frontend dev: typically `5173` (Vite)
- Postgres: `5432` (change by editing `DATABASE_URL` and, if using Docker, the port mapping in `docker-compose.yml`)
