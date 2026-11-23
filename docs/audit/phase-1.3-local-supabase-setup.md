# Famora — Phase 1.3 Local Supabase Setup Report

**Status:** `BLOCKED`
**Environment Target:** Local Supabase only (never production)
**Config File:** `supabase/config.toml`

---

## 1. Local Environment Inspection

| Prerequisite | Check / Path | Observed Status |
| :--- | :--- | :--- |
| Supabase project config | `supabase/config.toml` | **Present** (`project_id = "famora"`, API port `54321`, DB port `54322`, shadow port `54320`, Studio port `54323`, `site_url = "http://localhost:3000"`) |
| Docker Desktop / Engine | `docker info` | **BLOCKED** (`DOCKER_NOT_RUNNING` — Docker Desktop must be started) |
| Supabase CLI | `which supabase` | **BLOCKED** (`supabase not found` — Homebrew `/opt/homebrew/bin/brew` is available) |
| PostgreSQL client (`psql`) | `which psql` | **BLOCKED** (`psql not found`) |
| Migrations | `npm run db:validate` | **PASS** (`OK: Validated 29 migrations, 78 RLS-forced tables, 25 hardened SECURITY DEFINER functions, column-level pin_hash protection, zero unrestricted policies, and zero client service-role references.`) |

---

## 2. Local Supabase Startup & Migration Status

- `supabase start` could not be executed because:
  1. Docker Desktop is not running (`DOCKER_NOT_RUNNING`).
  2. The `supabase` CLI binary is not installed (`supabase not found`).
  3. The `psql` client binary is not installed (`psql not found`).
- Consequently, local PostgreSQL (`127.0.0.1:54322`), local Supabase Auth/API (`http://127.0.0.1:54321`), local Studio (`http://127.0.0.1:54323`), local migration application, and isolated local test user/family seeding remain **BLOCKED**.

---

## 3. Unblock Instructions

1. Start **Docker Desktop** and wait until `docker info` succeeds.
2. Install Supabase CLI and PostgreSQL client locally (e.g., `brew install supabase/tap/supabase libpq`).
3. Start the isolated local Supabase stack:
   ```bash
   supabase start
   ```
4. Configure isolated local test variables in `.env.test.local` (git-ignored, local only — never production):
   - `E2E_SUPABASE_URL` (local API URL, `http://127.0.0.1:54321`)
   - `E2E_SUPABASE_SERVICE_ROLE_KEY` (local `supabase status` service_role key)
   - `TEST_DATABASE_URL` (local PostgreSQL URI on port `54322`)
5. Re-run `npm run test:e2e` and `npm run test:rls`.
