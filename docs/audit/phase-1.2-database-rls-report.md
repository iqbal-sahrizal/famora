# Famora — Phase 1.2 Database & RLS Report

**Date**: 2026-11-23

## 1. Static Migration & RLS Validation (`npm run db:validate`)
- **Result**: **PASS** (exit `0`)
- **Coverage**: 29 migrations (`0001`–`0029`), 78 RLS-forced tables, 25 `SECURITY DEFINER` functions with explicit `search_path`, column-level `pin_hash` protection, 0 unrestricted policies, 0 client service-role references.

## 2. Live PostgreSQL & RLS Test Suite (`npm run test:rls`)
- **Created**: `supabase/tests/rls_security_audit.sql` and `scripts/run-rls-tests.mjs` verifying:
  - `ENABLE + FORCE ROW LEVEL SECURITY` on every `public.*` table via `pg_class`.
  - Zero `anon` / `PUBLIC` table grants on `families`, `family_members`, `finance_accounts`, `documents`, `child_health_records`, `chat_messages`.
  - Exclusion of `family_members.pin_hash` from `authenticated` `SELECT` column privileges.
- **Execution Status**: **BLOCKED** — Docker daemon is not running (`DOCKER_NOT_RUNNING`), `supabase` CLI and `psql` are not installed (`which supabase psql` -> not found), and `TEST_DATABASE_URL` is not configured.
