#!/bin/bash
# Kill any process using port 3001

echo "🔍 Checking for processes on port 3001..."
PIDS=$(lsof -ti :3001 2>/dev/null)

if [ -z "$PIDS" ]; then
  echo "✅ Port 3001 is already free"
  exit 0
fi

echo "⚠️  Found processes on port 3001: $PIDS"
echo "$PIDS" | xargs kill -9 2>/dev/null

sleep 1

# Verify it's killed
if lsof -i :3001 >/dev/null 2>&1; then
  echo "❌ Failed to free port 3001"
  exit 1
else
  echo "✅ Port 3001 is now free"
  exit 0
fi
