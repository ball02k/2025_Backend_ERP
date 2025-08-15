#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
branch="${1:-main}"

echo "→ Status"
git status -sb || true

# Stash if dirty
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "→ Stashing local changes…"
  git stash push -u -m "auto-stash: $(date -Iseconds)" || true
fi

echo "→ Fetch + rebase"
git fetch origin
git checkout "$branch"
git pull --rebase origin "$branch"

# Re-apply stash if present
if git stash list | grep -q "auto-stash"; then
  echo "→ Applying auto-stash"
  git stash pop || true
fi

echo "→ Final status"
git status -sb || true

