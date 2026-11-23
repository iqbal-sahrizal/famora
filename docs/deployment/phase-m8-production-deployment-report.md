# Famora — Phase M8: Direct Production Deployment Report

**Final Verdict:** `PRODUCTION_DEPLOYMENT_BLOCKED`  
**Strategy:** `PRODUCTION_ONLY — NO STAGING`  
**Date:** 2026-11-23

---

## 1. Infrastructure Discovery & Blockers

| Component | Discovered State | Blocker / Status |
| :--- | :--- | :--- |
| **GitHub / Git** | `origin` = `git@github.com:iqbal-sahrizal/famora.git`, branch `main`, `HEAD` = `3c5daaa428731ed2ec567dcc16bfa8f4693b6a1b` | **Uncommitted local changes** (M1–M7.1 + `0035_fix_delete_family_workspace_rpc.sql`) not yet committed/pushed to `origin/main`. |
| **Vercel** | `vercel` CLI not installed; `famora/.vercel` absent | **BLOCKED:** No linked Vercel project, auth session, or production URL available. |
| **Supabase Production** | `supabase` CLI not installed; `.env.local` holds development-only vars | **BLOCKED:** No dedicated production Supabase project reference provisioned; development Supabase must NOT be used. |
| **User-Owned Domain** | Not configured in repository | **BLOCKED:** Domain name and Vercel DNS assignment not yet provided/linked. |

---

## 2. Database Migrations, Seed Distinction & RLS Validation

- **Migrations (`0001`–`0035`, 35 files total):**
  - Static validation (`npm --prefix famora run db:validate`) **PASSED**: `35` migrations, `78` RLS-forced tables, `25` hardened `SECURITY DEFINER` functions, column-level `pin_hash` protection, zero unrestricted policies, zero client service-role references.
  - System reference roles/permissions are seeded inside `0005_seed_roles_and_permissions.sql` (production-required).
- **Seed script distinction:** `supabase/seed.sql` contains demo/local-only users (`maya@famora.local`, `daniel@famora.local`) and **MUST NOT** be executed in production.
- **Execution status:** **NOT EXECUTED** (`0` migrations applied to production because the dedicated production Supabase project is not provisioned yet).

### Exact Supabase Production Setup Steps (User Action Required)
1. Create a **new, dedicated Production Supabase project** in Supabase Dashboard (separate from dev).
2. Enable **Point-in-Time Recovery (PITR) / daily backups** before running migrations.
3. Apply `supabase/migrations/0001_extensions_and_helpers.sql` through `0035_fix_delete_family_workspace_rpc.sql` sequentially (`supabase db push` or SQL Editor in strict numeric order; **never** run `db reset` or `supabase/seed.sql`).
4. In **Authentication → URL Configuration**:
   - **Site URL:** `https://<production-domain>`
   - **Redirect URLs:** `https://<production-domain>/auth/callback`, `https://<production-domain>/**`
   - Enable email confirmation and configure SMTP provider.
5. Verify **Storage buckets & policies** created by migrations (`chat-attachments`, `family-documents`, `family-memories`, `child-dev-attachments` private with RLS).

---

## 3. Production Environment Variables Checklist (Names Only — No Values)

Configure in **Vercel → Project Settings → Environment Variables** (Production scope):

| Variable | Scope | Required / Optional | Notes |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Client + Server | Required | `"Famora"` |
| `NEXT_PUBLIC_APP_URL` | Client + Server | Required | Canonical `https://<production-domain>` |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Required | Dedicated **Production** Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Required | Dedicated **Production** Supabase anon/publishable key |
| `OPENAI_API_KEY` (or `AI_PROVIDER_API_KEY`) | **Server-only** | Optional (AI) | Required only if AI Assistant LLM mode is enabled |
| `OPENAI_MODEL` / `OPENAI_BASE_URL` | **Server-only** | Optional (AI) | Optional model/base URL override |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Client + Server | Optional (Push) | Required only if Web Push is enabled |
| `VAPID_PRIVATE_KEY` | **Server-only** | Optional (Push) | Never prefix with `NEXT_PUBLIC_` |
| `VAPID_SUBJECT` | **Server-only** | Optional (Push) | e.g. `mailto:support@<production-domain>` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** | Optional | Never expose in `NEXT_PUBLIC_*` or client code |
| `APP_ENCRYPTION_KEY` | **Server-only** | Optional | `>= 32` chars if configured |

---

## 4. Vercel & Domain Configuration Steps (User Action Required)

1. Commit and push verified `main` changes to `git@github.com:iqbal-sahrizal/famora.git`.
2. In Vercel Dashboard, import `iqbal-sahrizal/famora` (Framework: **Next.js**, Root Directory: `famora` if repo root is parent, Build Command: `npm run build`, Install Command: `npm install`, Node.js: `20.x` or `22.x`).
3. Add the Production environment variables above.
4. Add user-owned domain under **Vercel → Domains** and apply the exact `A` / `CNAME` DNS records provided by Vercel (without altering unrelated DNS records), confirming HTTPS certificate issuance.

---

## 5. Production Smoke Tests, Monitoring & Accepted Verification Debt

- **Live Production Smoke Tests:** **NOT EXECUTED (BLOCKED)** — awaiting live production URL and deployment.
- **Monitoring:** Once deployed, monitor Vercel Runtime/Deployment Logs, Supabase Auth & Postgres Logs, `/api/health`, and backup status in Supabase Dashboard.
- **Accepted Verification Debt (from M7.1, explicitly documented — NOT passed):**
  1. `7` authenticated E2E tests (`aud-001`, `aud-002`, `aud-003`, `mobile-m2-dashboard`, `mobile-m4-core`, `mobile-m5-comms`, `mobile-m7-qa`) not executed (missing `E2E_SUPABASE_URL` / `E2E_SUPABASE_SERVICE_ROLE_KEY`).
  2. `npm run test:rls` not executed against an isolated live PostgreSQL instance (`TEST_DATABASE_URL` unset).
  3. Physical iOS/Android hardware and Firefox/WebKit browser testing incomplete.
  4. M5 DB/RLS hardening recommendations (`0024_family_chat.sql`, `0028_ai_assistant.sql`) and Push Outbox service-role worker remain open.

---

## 6. Rollback Procedure

- **Application Rollback (Vercel):** Promote the previous healthy deployment in **Vercel → Deployments → Instant Rollback**. *(Does NOT revert database migrations.)*
- **Database Recovery (Supabase):** Prefer a reviewed forward-fix migration (`0036_*.sql`). If severe data corruption occurs, restore from Supabase Dashboard Backup / PITR via deliberate recovery procedure; never run destructive `db reset` in production.
