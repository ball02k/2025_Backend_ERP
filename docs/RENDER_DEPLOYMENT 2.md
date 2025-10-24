# Render Deployment Guide

This project includes a [`render.yaml`](../render.yaml) manifest that provisions the backend as a Render web service. This guide captures the deployment workflow that should be followed when promoting the `feature/render-fixes-2025-10-13` changes into `main`.

## Pre-merge checklist
- Confirm that only a single npm lockfile (`package-lock.json`) exists at the repository root.
- Verify that `render.yaml` is present and references the correct entrypoint (`node index.cjs`).
- Run a clean dependency installation and build to ensure the service compiles:
  ```bash
  npm ci
  npm run build
  ```
  The build should succeed on the feature branch **before** merging into `main`.

## Merge process
1. Make sure the working tree is clean and both `main` and `feature/render-fixes-2025-10-13` are up to date with `origin`.
2. On the feature branch, remove any secondary lockfiles (for example `package-lock 2.json`, `yarn.lock`, or `pnpm-lock.yaml`) if they exist and commit the cleanup.
3. Execute the build validation commands shown above.
4. Switch to `main` and attempt a fast-forward merge from the feature branch. If that is not possible, perform a no-fast-forward merge with an explicit message to preserve context.
5. Repeat the lockfile cleanup check on `main` post-merge and rerun the build to confirm nothing regressed.

## Deployment
- Push the updated `main` branch to `origin`.
- Trigger a Render deployment for the `2025_Backend_ERP` service. Render will execute the `buildCommand` (`npm install`) followed by the `startCommand` (`node index.cjs`).
- Monitor the Render dashboard to confirm the service becomes healthy.

## Rollback instructions
If an issue is detected after deployment:
1. Identify the pre-merge commit hash with `git reflog`.
2. Reset the `main` branch locally: `git reset --hard <pre-merge-sha>`.
3. Force-push the reset branch to `origin`: `git push --force-with-lease origin main`.
4. In Render, redeploy the previous successful build or roll back to a known good snapshot.

Documenting these steps ensures the Render manifest stays valid and the team can quickly respond to deployment issues.
