# Famora — Phase 1.1 Live Verification & Regression Report

**Date**: 2026-11-23  
**Final Verdict**: **`PHASE_1_VERIFIED_WITH_BLOCKERS`**

---

## 1. Regression & Build Gate Results

| Check | Command | Exit Code | Outcome | Verification Level |
|---|---|---|---|---|
| **Migration & RLS Static Validator** | `npm run db:validate` | `0` | **PASS** (29 migrations, 78 RLS-forced tables, 25 `SECURITY DEFINER` functions, 0 client service-role refs) | `UNIT_VERIFIED` (Static) |
| **TypeScript** | `npm run typecheck` | `0` | **PASS** (0 errors) | `UNIT_VERIFIED` |
| **ESLint** | `npm run lint` | `0` | **PASS** (0 errors, 0 warnings) | `UNIT_VERIFIED` |
| **Unit & Integration Tests** | `npm test` (`vitest run`) | `0` | **PASS** (25 test files, 108 tests passed) | `UNIT_VERIFIED` |
| **Isolated Clean Production Build** | `npm run build` in `/tmp/famora-verify-build` (no `.env.local`, active port `3000` `.next` untouched) | `0` | **PASS** (16/16 static pages, all 39 routes compiled) | `UNIT_VERIFIED` (Build) |
| **Playwright Browser E2E** | `which playwright` -> not found | — | **BLOCKED** | `BLOCKED` |
| **Live PostgreSQL / pgTAP** | `which supabase psql` -> not found | — | **BLOCKED** | `BLOCKED` |

---

## 2. Environment Variables Required for Production Build & Runtime
- **Build-time public**: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` *(optional for build)*.
- **Server-only runtime**: `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `OPENAI_API_KEY` *(optional)*.
- **Isolation note**: Clean build ran in `/tmp/famora-verify-build` without `.env.local` so zero production or user secrets were used.

---

## 3. Scenario-Level Summary

| Scenario ID | Scope | Verification Level | Status | Notes |
|---|---|---|---|---|
| **P1.1-BUILD-01** | Clean isolated production build | `UNIT_VERIFIED` (Build) | **PASS** | Exited `0` in `/tmp/famora-verify-build`. |
| **P1.1-REG-01** | `db:validate`, `typecheck`, `lint`, `vitest` (108 tests) | `UNIT_VERIFIED` | **PASS** | All 4 commands exited `0`. |
| **P1.1-AUD001-LIVE** | Browser offline -> retry -> DB persistence -> auth expiry | `BROWSER_VERIFIED` / `BACKEND_VERIFIED` | **BLOCKED** | `playwright` and seeded test Supabase accounts unavailable in CLI sandbox; unit-verified in `pwa-sync.test.ts` (6/6). |
| **P1.1-AUD002-LIVE** | Browser account nav, logout, reload/back, family switch | `BROWSER_VERIFIED` / `BACKEND_VERIFIED` | **BLOCKED** | `playwright` and multi-family test accounts unavailable in CLI sandbox; unit-verified in `workspace-navigation.test.ts` (3/3). |
| **P1.1-AUD003-LIVE** | Browser IndexedDB cache & sync across Shopping/Tasks/Calendar/Dashboard | `BROWSER_VERIFIED` / `BACKEND_VERIFIED` | **BLOCKED** | `playwright` unavailable; unit-verified in `pwa-sync.test.ts` (6/6). |
| **P1.1-DB-01** | Live migrations, `pgTAP`, RLS impersonation | `DATABASE_VERIFIED` | **BLOCKED** | `supabase` CLI and `psql` not installed; static `db:validate` passed. |
