# Famora — Phase 1.3 Live PostgreSQL RLS & Authorization Report

**Command:** `npm run test:rls`
**Exit Code:** `2`
**Status:** `BLOCKED`

---

## 1. Live Execution Output

```text
BLOCKED: TEST_DATABASE_URL is not set. Provide an isolated local/staging PostgreSQL URI (never production).
```

- Live PostgreSQL RLS verification could not run because `TEST_DATABASE_URL` is unset, `psql` is not installed (`psql not found`), `supabase` CLI is not installed (`supabase not found`), and Docker Desktop is not running (`DOCKER_NOT_RUNNING`).

---

## 2. Static Migration & Policy Validation

- **Command:** `npm run db:validate`
- **Exit Code:** `0`
- **Observed Output:**
  `OK: Validated 29 migrations, 78 RLS-forced tables, 25 hardened SECURITY DEFINER functions, column-level pin_hash protection, zero unrestricted policies, and zero client service-role references.`

---

## 3. Verification Classification

- **Static Schema & RLS Policy Audit:** `PASS` (`db:validate` exit `0`)
- **Live PostgreSQL RLS & Cross-Family Isolation Execution:** `BLOCKED` (requires running Docker Desktop, local Supabase PostgreSQL instance, `psql`, and `TEST_DATABASE_URL`).
