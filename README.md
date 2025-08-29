# Backend ERP

## Development

Install dependencies and start the dev server:

```
npm ci
npm run dev
```

Check server health:

```
npm run health
```

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

Set `VITE_API_BASE_URL=http://localhost:3001` so the dashboard's `/api/projects` shows the seeded project.
