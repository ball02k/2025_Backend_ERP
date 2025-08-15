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
INIT=$(curl -s -X POST http://localhost:3001/api/documents/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"hello.txt","contentType":"text/plain"}')
KEY=$(echo "$INIT" | jq -r '.data.storageKey'); URL=$(echo "$INIT" | jq -r '.data.uploadUrl')

2) UPLOAD (stream body)
echo "hello world" | curl -s -X PUT --data-binary @- "http://localhost:3001$URL" | jq .

3) COMPLETE (record metadata + link to project 1)
curl -s -X POST http://localhost:3001/api/documents/complete \
  -H "Content-Type: application/json" \
  -d "{\"storageProvider\":\"local\",\"storageKey\":\"$KEY\",\"fileName\":\"hello.txt\",\"contentType\":\"text/plain\",\"size\":11,\"projectId\":1}" | jq .

4) LIST
curl -s "http://localhost:3001/api/documents?projectId=1&limit=5" | jq '.meta, .data[].fileName'

# Setup
nvm use
bash scripts/clean_install.sh
npm run prisma:validate
npm run prisma:deploy
npm run seed:demo
npm run dev
# or: npm run dev:all

## Frontend

Set `VITE_API_BASE_URL=http://localhost:3001` so the dashboard's `/api/projects` shows the seeded project.
