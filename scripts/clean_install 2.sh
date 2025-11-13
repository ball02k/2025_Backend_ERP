#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Pin Node
if command -v nvm >/dev/null 2>&1; then
  nvm install 20.16.0
  nvm use 20.16.0
fi
echo "Node: $(node -v)"

# Clean & reinstall
rm -rf node_modules .prisma package-lock.json
npm cache clean --force
npm install

# Prisma client
npx prisma generate

