# Famora — Staging Deployment Report

**Date:** 2026-11-23
**Final Verdict:** **`STAGING_DEPLOYMENT_BLOCKED`**

---

## 1. Deployment Configuration Inspection

- **Application Stack:** Next.js `15.5.29` (`next.config.ts`) + Supabase (PostgreSQL, Auth, Storage, Realtime).
- **CI Pipeline:** `.github/workflows/ci.yml` runs `npm ci`, `npm run db:validate`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` on `main`.
- **Intended Hosting & Services (`docs/deployment-guide.md`):** Managed Next.js HTTPS hosting (e.g., Vercel / Cloudflare / reverse proxy) paired with a dedicated staging Supabase project.
- **Database Migrations:** `supabase/migrations/0001_*.sql` through `0034_*.sql` (validated statically by `npm run db:validate`).
- **Private Storage Buckets:** `family-documents`, `family-memories`, `family-chat` (`chat-attachments`), and `family-child-attachments` (all `public = false`).

---

## 2. Host Tooling & Infrastructure Blockers

| Prerequisite | Check / Command | Observed Status |
| :--- | :--- | :--- |
| Hosting CLI (`vercel` / `netlify`) | `which vercel netlify` | **`BLOCKED`** (`vercel: not found`, `netlify: not found`) |
| GitHub CLI | `which gh` | **`BLOCKED`** (`gh: not found`) |
| Supabase CLI | `which supabase` | **`BLOCKED`** (`supabase: not found`) |
| PostgreSQL CLI | `which psql` | **`BLOCKED`** (`psql: not found`) |
| Docker Desktop | `docker info` | **`BLOCKED`** (`/opt/homebrew/bin/docker` installed, daemon `DOCKER_NOT_RUNNING`) |
| Staging Supabase & VAPID Credentials | `.env.local` / env | **`BLOCKED`** (no staging Supabase project URL, service-role key, `TEST_DATABASE_URL`, or `VAPID_PRIVATE_KEY` configured) |

Because no staging hosting CLI/credentials, staging Supabase project credentials, or running Docker/Supabase CLI are available in this environment:
- Staging deployment, migration application (`0001`–`0034`), Auth URL configuration, VAPID key provisioning, health/PWA smoke check against a staging URL, and multi-family/multi-role test account seeding could not be executed.

---

## 3. Unblock Procedure

1. Provision a dedicated **Staging Supabase Project** (separate from production) and obtain its URL, anon key, service-role key, and direct Postgres URI (`TEST_DATABASE_URL`).
2. Install `supabase` CLI (`brew install supabase/tap/supabase`), `libpq` (`psql`), and your hosting CLI (e.g., `npm i -g vercel`), or connect the repository to your hosting provider's staging branch.
3. Apply migrations `0001`–`0034` to staging (`supabase db push` / `supabase link --project-ref <staging-ref>`).
4. Configure staging Auth Site URL & Redirect URLs (`https://<staging-domain>/**`) and generate staging-only VAPID keys (`npx web-push generate-vapid-keys`).
5. Deploy to staging, seed isolated multi-family/multi-role test accounts, and execute Acceptance Gates A, B, and C.
