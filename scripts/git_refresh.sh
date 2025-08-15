#!/usr/bin/env bash
set -euo pipefail
branch="${1:-main}"

echo "→ Checking status…"
git status -sb

# Stash only if there are changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "→ Stashing local changes…"
  git stash push -u -m "auto-stash: $(date -Iseconds)" || true
fi

echo "→ Fetching…"
git fetch origin

echo "→ Rebasing onto origin/${branch}…"
git checkout "${branch}"
git pull --rebase origin "${branch}"

# Re‑apply stash if any
if git stash list | grep -q "auto-stash"; then
  echo "→ Applying latest auto-stash…"
  git stash pop || true
fi

echo "→ Final status:"
git status -sb

# Optional cleanup of untracked junk that isn't ignored
# git clean -fd
