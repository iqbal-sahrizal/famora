# Famora — Blocked & Unverified Tests

| Item | Blocker | Exact Unblock Requirement |
| --- | --- | --- |
| **Live PostgreSQL & pgTAP RLS Tests** | `supabase` CLI, `psql`, and local Docker Postgres are not installed in this environment. | Install Supabase CLI / Docker or run `0001`–`0029` against staging Supabase and execute `pgTAP` / SQL role-impersonation tests (`SET LOCAL ROLE authenticated`). |
| **16-Step Playwright Browser E2E Suite** | `playwright` is not installed and no seeded multi-role test accounts exist in this CLI sandbox. | Install `@playwright/test`, configure `.env.test` with two isolated test families and multi-role users, and run E2E suite. |
| **Web Push Live Browser Subscription & Dispatch** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are not configured in `.env.local`, and headless browser push service testing is unavailable here. | Generate VAPID keys (`npx web-push generate-vapid-keys`), configure HTTPS staging, subscribe via Chrome/Safari, and verify `notification_delivery_logs`. |
| **Email Verification / SMTP Flows** | Custom SMTP and inbox polling are not wired for automated verification. | Configure Supabase SMTP or Inbucket local mail capture and test signup/invite/reset links. |
| **PWA Install, Offline Nav, SW Update & iOS Safari** | Physical Chrome Android, Safari iOS, and Safari Desktop devices are not attached to this CLI sandbox. | Test on staging HTTPS URL across Chrome Desktop, Chrome Android, Safari iOS 16.4+, and Safari macOS. |
| **Lighthouse & Live Accessibility Audit** | `lighthouse` CLI is not installed. | Run `npx lighthouse <staging-url> --only-categories=performance,accessibility,pwa` against a clean production build. |
