# Famora — Phase 1.3 Live Browser E2E Report

**Command:** `npm run test:e2e` (`playwright test`)
**Target Server:** Isolated Next.js dev server (`http://localhost:3010` via `playwright.config.ts`)
**Browser:** Google Chrome (`channel: "chrome"`)
**Exit Code:** `0`
**Summary:** `3 passed, 3 skipped (10.2s)`

---

## 1. Execution Results

| # | Spec / Scope | Result | Notes |
| :--- | :--- | :--- | :--- |
| 1 | `aud-001-pwa-retry.spec.ts` — IndexedDB queue, retry after failure, single persistence, preserve on auth expiry | **SKIPPED (`BLOCKED`)** | Skipped because `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` are not configured (local Supabase not running). |
| 2 | `aud-002-navigation.spec.ts` — Family Switcher without data leak, Sign Out session invalidation | **SKIPPED (`BLOCKED`)** | Skipped because `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` are not configured (local Supabase not running). |
| 3 | `aud-003-offline.spec.ts` — Calendar & Shopping offline persistence in IndexedDB and sync on reconnect | **SKIPPED (`BLOCKED`)** | Skipped because `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` are not configured (local Supabase not running). |
| 4 | Health, PWA manifest, Service Worker & offline fallback (`/api/health`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`) | **PASSED** (`245ms`) | Verified clean HTTP responses in real Chrome. |
| 5 | Public landing page, auth pages, and fail-closed redirect on unauthenticated protected routes | **PASSED** (`5.1s`) | Verified unauthenticated access to protected routes fails closed. |
| 6 | Service Worker registration and IndexedDB `famora-pwa-db` persistence | **PASSED** (`685ms`) | Verified real browser Service Worker registration and IndexedDB persistence. |

---

## 2. Verification Classification

- **Unauthenticated / Infrastructure Browser Checks (3 specs):** `BROWSER_VERIFIED` (`PASS`)
- **Authenticated Multi-User / Multi-Family E2E Checks (`AUD-001`, `AUD-002`, `AUD-003`):** `BLOCKED` (awaiting running Docker Desktop + local Supabase stack + local test environment variables).
