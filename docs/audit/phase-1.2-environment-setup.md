# Famora — Phase 1.2 Environment Setup Report

**Date**: 2026-11-23

## 1. Installed Tooling & Dependency Changes
- **Playwright**: Installed `@playwright/test` (`devDependencies` in `package.json` and `package-lock.json`).
- **Browser**: Configured `playwright.config.ts` to use installed Google Chrome (`/Applications/Google Chrome.app`, `channel: "chrome"` locally, Chromium in CI) with `trace: "on-first-retry"`, `screenshot: "only-on-failure"`, `video: "retain-on-failure"`, and isolated `webServer` on port `3010`.
- **Scripts Added (`package.json`)**:
  - `test:e2e`: `playwright test`
  - `test:e2e:ui`: `playwright test --ui`
  - `test:rls`: `node scripts/run-rls-tests.mjs`
- **Secret Protection**: Added `.gitignore` ignoring `.env*` (except templates), `node_modules/`, `.next/`, `playwright-report/`, and `test-results/`, plus `.env.test.example`.

## 2. Isolated Test Fixtures (`e2e/fixtures/test-data.ts`)
- Deterministic seeder & cleanup (`seedPhase1Fixtures` / `cleanupPhase1Fixtures`) for:
  - **User A**: Owner of **Family A**
  - **User B**: Adult member of **Family A**
  - **User C**: Owner of **Family B**
  - **User D**: Authenticated user without membership in either family

## 3. CI & Local Prerequisites
- **Unit & Static Gates**: `npm run db:validate && npm run typecheck && npm run lint && npm test` (all runnable offline with 0 external dependencies).
- **Authenticated E2E (`AUD-001`, `AUD-002`, `AUD-003`)**: Requires `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` pointing to an isolated local/staging Supabase instance (never production).
- **Live PostgreSQL RLS Suite (`npm run test:rls`)**: Requires Docker Desktop running + `supabase` CLI / `psql` + `TEST_DATABASE_URL`.
