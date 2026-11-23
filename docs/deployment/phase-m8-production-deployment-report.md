# Famora — Phase M8: Production Deployment Report (Reuse Existing Infrastructure)

**Final Verdict:** `PRODUCTION_DEPLOYMENT_BLOCKED`  
**Strategy:** `PRODUCTION_ONLY — NO STAGING` (Reuse existing hosted Supabase & Vercel project)  
**Date:** 2026-11-23

---

## 1. Pre-Deployment Audit (`PASSED`)

- **Repository & Branch:** `git@github.com:iqbal-sahrizal/famora.git`, branch `main`, base `HEAD` = `3c5daaa428731ed2ec567dcc16bfa8f4693b6a1b`.
- **Push Access:** `git -C famora push --dry-run origin main` succeeded (`Everything up-to-date`).
- **Secret Hygiene:** `NO_UNTRACKED_SECRETS` (`.env*` ignored by `.gitignore`; `tsconfig.tsbuildinfo`, `playwright-report/`, `test-results/` excluded).
- **Validation Results (run on M1–M7.1 code + migration `0035`):**
  - `npm --prefix famora run db:validate`: **PASSED** (`35` migrations, `78` RLS-forced tables, `25` hardened `SECURITY DEFINER` functions, column-level `pin_hash` protection, zero unrestricted policies, zero client service-role references).
  - `npm --prefix famora run typecheck`: **PASSED** (`0` errors).
  - `npm --prefix famora run lint`: **PASSED** (`0` errors, `0` warnings).
  - `npm --prefix famora test`: **PASSED** (`33` files, `150/150` unit tests).
  - `npm --prefix famora run build`: **PASSED**.

---

## 2. Existing Supabase Project (`eaxrhlgwsepdlfnveypo`) — Stopped at Backup & Migration

- **Target Project Reference:** `eaxrhlgwsepdlfnveypo` (`https://eaxrhlgwsepdlfnveypo.supabase.co` — confirmed hosted Supabase project).
- **Migration `0035_fix_delete_family_workspace_rpc.sql` Audit:** Safe (`CREATE OR REPLACE FUNCTION` fixing deletion dependency order and revoking `anon` execute).
- **Seed Policy:** `supabase/seed.sql` MUST **NOT** be executed.
- **Stop Reason (Blocker):** `supabase` CLI is not installed (`NO_SUPABASE_CLI`), and no Supabase management access token or direct Postgres connection URI is available in this environment to:
  1. Trigger/verify a pre-migration database backup on `eaxrhlgwsepdlfnveypo`.
  2. Query `supabase_migrations.schema_migrations` to determine which of `0001`–`0035` are unapplied and apply only missing migrations.

### Required User Action (Supabase Dashboard / CLI)
1. Open Supabase Dashboard for project **`eaxrhlgwsepdlfnveypo`** → **Database → Backups** and create/confirm a manual backup (or verify PITR) before migrating.
2. Check applied migrations in **SQL Editor**:
   ```sql
   SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
   ```
3. Apply only unapplied migrations from `supabase/migrations/` in strict numeric order (e.g., `0035_fix_delete_family_workspace_rpc.sql` if missing). Do **not** run `supabase/seed.sql` or `db reset`.

---

## 3. Existing Vercel Project & Deployment — Stopped Pending DB & CLI/Domain Access

- **GitHub Push Status:** Not yet pushed to `origin/main` so an automatic Vercel production deploy is not triggered before the `eaxrhlgwsepdlfnveypo` backup & migration check completes.
- **Vercel CLI / Config:** `vercel` CLI is not installed (`NO_VERCEL_CLI`), `famora/.vercel` is absent, and the production domain URL is not stored in the repository.
- **Required User Action (Vercel Dashboard):**
  1. Confirm existing Vercel project is linked to `iqbal-sahrizal/famora` (branch `main`, Root Directory `famora`, Build Command `npm run build`).
  2. Confirm Production Environment Variables: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` (`https://<production-domain>`), `NEXT_PUBLIC_SUPABASE_URL` (`https://eaxrhlgwsepdlfnveypo.supabase.co`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus server-only `OPENAI_API_KEY` (and `VAPID_*` if push is enabled).
  3. Confirm Supabase **Authentication → URL Configuration** Site URL & Redirect URLs match `https://<production-domain>`.
  4. Once Supabase backup & migrations are complete, commit & push `main` (excluding `tsconfig.tsbuildinfo` and `.env*`) to trigger Vercel production deployment, then verify HTTPS & smoke tests on the live domain.

---

## 4. Production Smoke Tests & Accepted Verification Debt

- **Live Production Smoke Tests:** **NOT EXECUTED** (blocked pending live deployment URL).
- **Accepted Verification Debt (from M7.1, NOT passed):**
  - `7` authenticated E2E tests not executed (`E2E_SUPABASE_URL` / `E2E_SUPABASE_SERVICE_ROLE_KEY` unset).
  - `npm run test:rls` not executed against a live isolated PostgreSQL instance (`TEST_DATABASE_URL` unset).
  - Physical iOS/Android and Firefox/WebKit browser testing incomplete.
