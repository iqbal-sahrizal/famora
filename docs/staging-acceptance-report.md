# Famora — Staging Acceptance Report

**Date:** 2026-11-23
**Final Verdict:** **`STAGING_DEPLOYMENT_BLOCKED`**

---

## 1. Acceptance Gates Status

| Gate | Scope | Execution Status | Exact Evidence / Blocker |
| :--- | :--- | :--- | :--- |
| **Gate A: Live PostgreSQL RLS** | `npm run test:rls` against staging DB (`0001`–`0034`) | **`BLOCKED`** | `npm run test:rls` exited `2`: `BLOCKED: TEST_DATABASE_URL is not set.` (`psql` not installed, `supabase` CLI not installed, Docker `DOCKER_NOT_RUNNING`, no staging DB provisioned). |
| **Gate B: Authenticated Playwright E2E** | `aud-001` (PWA retry), `aud-002` (Family switcher & Sign Out), `aud-003` (IndexedDB offline sync) using isolated multi-family/multi-role accounts | **`BLOCKED`** | `npm run test:e2e` skipped all 3 authenticated specs (`3 passed, 3 skipped` in `8.8s`) because `E2E_SUPABASE_URL` & `E2E_SUPABASE_SERVICE_ROLE_KEY` are unset and no staging Supabase/app is deployed. |
| **Gate C: Real-Browser Web Push** | VAPID keys configured, real browser subscription created, RFC 8291 (`aes128gcm`) notification delivered | **`BLOCKED`** | `VAPID_PRIVATE_KEY` not configured in `.env.local` (`VAPID_CONFIGURED=false`), no staging HTTPS origin deployed, and no live browser push subscription exists. |

---

## 2. Baseline Pre-Deployment Code & Static Gates (Already Verified)

- `npm run db:validate`: **PASS** (`34` migrations, `78` RLS-forced tables, `25` hardened `SECURITY DEFINER` functions, zero unrestricted policies, zero client service-role refs)
- `npm run typecheck`: **PASS** (0 errors)
- `npm run lint`: **PASS** (0 errors, 0 warnings)
- `npm test`: **PASS** (`32` test files, `133` tests passed, including RFC 8291 round-trip encryption/header/410 tests)
- `npm run build` (isolated): **PASS** (`10.9s`, `16/16` static pages, `39` routes)
- `npm run test:e2e` (unauthenticated smoke & PWA shell): **3 passed** (`/api/health`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`, fail-closed redirects, Service Worker + IndexedDB `famora-pwa-db`)
