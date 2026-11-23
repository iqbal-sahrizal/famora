# Famora — Phase 1.2 Browser E2E Report

**Date**: 2026-11-23  
**Command Executed**: `npm run test:e2e` (Playwright + Google Chrome on isolated `http://localhost:3010`)  
**Exit Code**: `0` (**3 passed, 3 skipped**, 10.9s)

| Spec / Scenario | Result | Verification Level | Blocker / Notes |
|---|---|---|---|
| `e2e/smoke-and-pwa.spec.ts` — Serves `/api/health`, `/manifest.webmanifest`, `/sw.js`, `/offline.html` | **PASS** (376ms) | `BROWSER_VERIFIED` | Verified `200 OK`, `display: "standalone"`, `CACHE_VERSION = "v2"`, offline fallback HTML. |
| `e2e/smoke-and-pwa.spec.ts` — Renders `/`, `/login` & fails closed on `/f/0000...` | **PASS** (5.3s) | `BROWSER_VERIFIED` | Unauthenticated `/f/0000...` redirected cleanly to `/login`. |
| `e2e/smoke-and-pwa.spec.ts` — Real browser IndexedDB `famora-pwa-db` object stores | **PASS** (802ms) | `BROWSER_VERIFIED` | Verified `offline_cache` and `mutation_outbox` stores in Chrome. |
| `e2e/aud-001-pwa-retry.spec.ts` — Offline mutation, IndexedDB outbox, Retry, duplicate/auth-expiry | **BLOCKED** (Skipped) | `BLOCKED` | Requires `E2E_SUPABASE_URL` & `E2E_SUPABASE_SERVICE_ROLE_KEY` for isolated test Supabase. |
| `e2e/aud-002-navigation.spec.ts` — Account nav, Logout, Family Switcher A <-> B, unauthorized rejection | **BLOCKED** (Skipped) | `BLOCKED` | Requires `E2E_SUPABASE_URL` & `E2E_SUPABASE_SERVICE_ROLE_KEY` for isolated test Supabase. |
| `e2e/aud-003-offline.spec.ts` — Shopping/Tasks/Calendar/Dashboard offline cache & reconnect sync | **BLOCKED** (Skipped) | `BLOCKED` | Requires `E2E_SUPABASE_URL` & `E2E_SUPABASE_SERVICE_ROLE_KEY` for isolated test Supabase. |
