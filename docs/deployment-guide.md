# Famora Production Deployment Guide

## 1. Environment Variables
Use `.env.example` as the template. Never reuse development credentials in production.
- **Required**: `NEXT_PUBLIC_APP_URL` (HTTPS domain), `NEXT_PUBLIC_SUPABASE_URL` (base origin only, no `/rest/v1/` suffix), `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Server-Only Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `OPENAI_API_KEY` (never prefix with `NEXT_PUBLIC_`).

## 2. Database & Storage Setup (Supabase)
1. Provision a dedicated production Supabase project and enable **Daily Backups / Point-in-Time Recovery (PITR)**.
2. Apply all numbered migrations `supabase/migrations/0001_*.sql` through `0029_*.sql` in order (never destructively edit applied migrations).
3. Verify `storage.buckets` contains private buckets (`public = false`): `family-documents`, `chat-attachments`, and `family-memories`.

## 3. Authentication, Email & Domain
1. In **Supabase → Authentication → URL Configuration**, set **Site URL** to `https://<your-production-domain>` and add `https://<your-production-domain>/**` to **Redirect URLs**.
2. Configure a custom SMTP provider (Resend / Postmark / SES) for invitation, verification, and password-reset emails.
3. Enforce HTTPS (automatic on Vercel / Cloudflare / managed reverse proxy).

## 4. Web Push (VAPID)
1. Generate production-only VAPID keys (`npx web-push generate-vapid-keys`).
2. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:support@<domain>`.

## 5. CI/CD & Launch
1. Push to `main` to trigger `.github/workflows/ci.yml` (`db:validate`, `typecheck`, `lint`, `test`, `build`).
2. Deploy to your hosting platform only after explicit launch authorization, then verify `GET /api/health` returns `200 OK` and `GET /manifest.webmanifest` returns `200 OK`.
