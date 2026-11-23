# Famora — Phase 1.1 Security & RLS Verification

**Date**: 2026-11-23

| Check ID | Scope | Verification Level | Status | Evidence & Blocker |
|---|---|---|---|---|
| **SEC-01** | Migration & RLS static integrity (78 tables forced RLS, 25 `SECURITY DEFINER` functions, `pin_hash` protection, 0 unrestricted policies, 0 client service-role refs) | `UNIT_VERIFIED` (Static) | **PASS** | `npm run db:validate` exited `0`. |
| **SEC-02** | Client secret isolation (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY` absent from `"use client"`) | `UNIT_VERIFIED` | **PASS** | `security-audit.test.ts` passed (4/4). |
| **SEC-03** | Permission-aware family switching (`validateFamilySwitchTarget` rejects non-member family IDs) | `UNIT_VERIFIED` | **PASS** | `workspace-navigation.test.ts` passed (3/3). |
| **SEC-04** | Offline family isolation & disallowed domains (`finance`, `permissions`, `sensitive_uploads` blocked from offline outbox) | `UNIT_VERIFIED` | **PASS** | `pwa-sync.test.ts` passed (6/6). |
| **SEC-05** | Live PostgreSQL migrations, `pgTAP`, `SET LOCAL ROLE authenticated` RLS isolation, and live Server Action auth bypass tests | `DATABASE_VERIFIED` / `BACKEND_VERIFIED` | **BLOCKED** | `supabase` CLI and `psql` are not installed (`which supabase psql` -> not found) and no isolated staging/test DB credentials are configured. |
