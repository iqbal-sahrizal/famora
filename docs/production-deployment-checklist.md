# Famora — Production Deployment Checklist

## 1. Staging Pre-Cutover Gates (Mandatory Before Production — Currently `STAGING_DEPLOYMENT_BLOCKED`)

> See `docs/staging-deployment-report.md`, `docs/staging-environment-config.md`, and `docs/staging-acceptance-report.md` for current staging blockers (`DOCKER_NOT_RUNNING`, missing `supabase`/`psql`/hosting CLIs, and missing staging Supabase/VAPID credentials).

- [ ] Provision isolated staging Supabase project (or start local Docker + `supabase start`).
- [ ] Apply all database migrations `0001` through `0034` and verify `npm run db:validate` exits `0`.
- [ ] Execute live PostgreSQL RLS suite (`TEST_DATABASE_URL=... npm run test:rls`) and confirm all cross-family and role-isolation checks pass.
- [ ] Configure `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` against staging/local and run `npm run test:e2e` (confirm all 6 specs pass with 0 skipped).
- [ ] Generate and configure VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) and verify real-browser RFC 8291 (`aes128gcm`) Web Push delivery + 404/410 revocation.
- [ ] Run Lighthouse audit on staging URLs (Performance, Accessibility, Best Practices, SEO, PWA).

## 2. Production Environment & Secrets

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set to production Supabase project.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` stored exclusively in server-side secret manager (never exposed to browser bundles).
- [ ] `NEXT_PUBLIC_APP_URL` set to production HTTPS origin; Supabase Auth Site URL & Redirect URLs configured (`/auth/callback`).
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` configured for production domain.
- [ ] Optional `OPENAI_API_KEY` configured if external AI provider is enabled (otherwise local context engine fallback runs).
- [ ] Production SMTP / email provider configured in Supabase Auth for signup verification and password resets.

## 3. Database, Storage & Security Verification

- [ ] Migrations `0001`–`0034` applied cleanly to production Supabase without destructive resets.
- [ ] Verify private storage buckets exist and have `public = false`: `family-documents`, `family-memories`, `family-chat`, `family-child-attachments`.
- [ ] Confirm database automated daily backups & point-in-time recovery (PITR) are enabled.
- [ ] Confirm `/api/health` returns `200 OK` over HTTPS.

## 4. Rollback & Operations Readiness

- [ ] Review `docs/rollback-plan.md` and `docs/operations-runbook.md` with on-call team.
- [ ] Verify error tracking and monitoring alerts for API failures, outbox push failures, and sync errors.
