# SENVAMILY — Complete Product Rebranding Report

**Date:** 2026-11-24  
**New Brand:** **Senvamily** — *Your Family, Your World.*  
**Production URL (preserved):** `https://famora-eight.vercel.app`  
**Supabase Project (preserved):** `eaxrhlgwsepdlfnveypo`  
**Verdict:** **`SENVAMILY_REBRANDING_COMPLETE_WITH_DEBT`**

> **Why `WITH_DEBT` instead of `COMPLETE`?** Codebase, UI, metadata, Open Graph, PWA manifest, service worker, push payload, Android app name, unit tests, and production build are 100% rebranded and verified. However, Supabase Auth email sender name and hosted Auth email templates (if customized in the Supabase Dashboard) require manual verification/update in the Supabase Dashboard, and Vercel production deployment is intentionally held until final review per instruction.

---

## 1. Summary of Branding Changes

- Rebranded all user-facing application surfaces from **Famora** to **Senvamily** (*Your Family, Your World.*) using the existing **Warm Clarity** visual system (`#315C49` forest green, `#F7F5EF` warm white, `#DCE8D9` sage green, `#282C29` charcoal) and unified `HeartHandshake` emblem.
- Updated Next.js App Router SEO/Open Graph/Twitter metadata, `manifest.webmanifest`, service worker (`sw.js` bumped to `v4` with `senvamily-*` cache names), offline fallback pages (`public/offline.html` and Capacitor `index.html`), Web Push default title/body, Indonesian & English i18n copy, AI assistant persona, CSV export filename, and Android native app display name (`Senvamily`).
- Preserved all database schemas, migrations, RLS policies, API contracts, auth logic, Supabase project IDs, and Android package ID (`app.famora.family`) to guarantee zero regression for existing accounts and stored family data.

---

## 2. Updated Files

- **[src/config/site.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/config/site.ts):** Updated `name` (`Senvamily`), `tagline` (`Your Family, Your World.`), `description`, `shortDescription`, and `emailSenderName`.
- **[src/lib/env.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/lib/env.ts):** Updated `NEXT_PUBLIC_APP_NAME` default from `"Famora"` to `"Senvamily"`.
- **[src/app/layout.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/layout.tsx):** Added `metadataBase`, `applicationName`, `alternates.canonical`, `openGraph`, `twitter` card metadata, and updated `appleWebApp.title`.
- **[src/app/manifest.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/manifest.ts):** Updated `name` (`Senvamily — Your Family, Your World.`), `short_name` (`Senvamily`), and `description`.
- **[src/components/ui/brand-logo.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/components/ui/brand-logo.tsx):** Renamed component to `SenvamilyLogo` and updated wordmark to `Senvamily`.
- **[src/components/ui/splash-screen.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/components/ui/splash-screen.tsx):** Renamed component to `SenvamilySplashScreen` with default `label = "Senvamily"`.
- **[src/app/loading.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/loading.tsx) & [src/app/(app)/f/[familyId]/loading.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/(app)/f/[familyId]/loading.tsx):** Wired to `SenvamilySplashScreen`.
- **[src/features/auth/components/auth-shell.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/auth/components/auth-shell.tsx):** Wired to `SenvamilyLogo`.
- **[src/app/page.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/page.tsx) & [src/components/layout/app-shell.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/components/layout/app-shell.tsx):** Updated header, sidebar, and footer wordmarks to `Senvamily`.
- **[src/features/auth/server.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/auth/server.ts):** Updated default member fallback display name to `"Senvamily Member"`.
- **[src/features/ai/components/family-ai-view.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/ai/components/family-ai-view.tsx) & [src/features/ai/provider.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/ai/provider.ts):** Updated AI assistant heading and system prompt identity to `Senvamily AI`.
- **[src/features/finance/components/family-analytics-view.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/finance/components/family-analytics-view.tsx):** Updated CSV download filename prefix to `senvamily-finance-report-*`.
- **[src/features/notifications/logic.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/notifications/logic.ts):** Updated sanitized Web Push body to `"Open Senvamily to view details."`.
- **[src/lib/i18n/messages.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/lib/i18n/messages.ts):** Updated all user-facing `Famora` copy in both `id` and `en` locales to `Senvamily`.
- **[public/sw.js](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/public/sw.js):** Bumped `CACHE_VERSION` to `"v4"`, renamed caches to `senvamily-shell-v4` / `senvamily-static-v4`, and updated push notification default title to `"Senvamily"`.
- **[public/offline.html](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/public/offline.html):** Updated `<title>` to `Offline · Senvamily` and added the Senvamily icon mark.
- **[capacitor.config.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/capacitor.config.ts), [android/app/src/main/assets/capacitor.config.json](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/src/main/assets/capacitor.config.json), [android/app/src/main/res/values/strings.xml](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/src/main/res/values/strings.xml), [android/app/src/main/java/app/famora/family/MainActivity.java](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/src/main/java/app/famora/family/MainActivity.java), [capacitor-web/index.html](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/capacitor-web/index.html), [android/app/src/main/assets/public/index.html](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/src/main/assets/public/index.html):** Updated `appName`, `title_activity_main`, accessibility content description, and offline fallback copy to `Senvamily`.
- **[README.md](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/README.md):** Updated documentation title and overview to Senvamily.
- **[src/lib/i18n/__tests__/i18n.test.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/lib/i18n/__tests__/i18n.test.ts) & [src/features/notifications/__tests__/notifications.test.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/notifications/__tests__/notifications.test.ts):** Updated brand assertion expectations to `Senvamily`.

---

## 3. Newly Created Assets

- **[src/app/opengraph-image.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/opengraph-image.tsx):** Next.js Edge Open Graph image (`1200x630`, PNG) featuring the Senvamily emblem, `"Senvamily"`, `"YOUR FAMILY, YOUR WORLD."`, and brand description on `#F7F5EF` / `#315C49`.

---

## 4. Retained `Famora` References & Rationale

| Reference / Location | Rationale for Retention |
| --- | --- |
| `https://famora-eight.vercel.app` (`PRODUCTION_APP_URL`, `AndroidManifest.xml`, `capacitor.config.ts`) | Verified production domain & Supabase Auth redirect target; prompt forbids inventing a new domain. |
| `app.famora.family` (`package_name`, `applicationId`, `assetlinks.json`, `MainActivity.java` package) | Preserves Android App Links verification, release keystore signing identity, and existing APK upgrade continuity. |
| `--famora-*`, `.famora-skeleton`, `.famora-progress-bar` (`src/app/globals.css`) | Internal CSS custom properties and utility class names. |
| `famora_locale` cookie (`messages.ts`, `locale-provider.tsx`) | Preserves existing users' saved language preference without forcing re-selection. |
| `famora-pwa-db`, `famora:onboarding-draft:*`, `famora_install_dismissed`, `famora:pwa-outbox-changed` | Preserves existing IndexedDB offline queue and browser storage state. |
| `famora_stream`, `famora_rate_limit`, `famora_policy`, `famora_local`, `service: "famora"` | Internal AI rate-limit/telemetry identifiers and `/api/health` service slug. |
| `invite.goToFamora` i18n key (`messages.ts`, `invite-acceptance-card.tsx`) | Internal i18n key identifier; rendered UI text is `"Buka Senvamily"` / `"Go to Senvamily"`. |
| `mailto:support@famora.app` fallback (`src/features/notifications/vapid.ts`) | Internal VAPID JWT `sub` claim fallback (overridden by `VAPID_SUBJECT` env var in production). |

---

## 5. Authentication & Email Configuration Changes

- **Codebase:** Auth UI (`login`, `signup`, `verify-email`, `forgot-password`, `reset-password`, `invite/[token]`) and `siteConfig.emailSenderName` now use **Senvamily**. `emailRedirectTo` and `redirectTo` continue using `https://famora-eight.vercel.app/auth/callback` (no auth/redirect logic altered).
- **Manual Supabase Dashboard Steps (required):**
  1. Open **Supabase Dashboard → Project `eaxrhlgwsepdlfnveypo` → Authentication → Email Templates**.
  2. Update **Confirm signup**, **Reset password**, **Invite user**, and **Magic Link** subjects and HTML bodies to reference **Senvamily** instead of Famora while keeping `{{ .ConfirmationURL }}` / `{{ .SiteURL }}`.
  3. Under **Project Settings → Auth → SMTP Settings** (if custom SMTP is configured), set **Sender name** to `Senvamily`.

---

## 6. PWA & Push Notification Changes

- **Manifest:** Updated `src/app/manifest.ts` to `Senvamily — Your Family, Your World.` / `short_name: "Senvamily"`.
- **Service Worker (`public/sw.js`):** Bumped `CACHE_VERSION` to `"v4"` and renamed caches (`senvamily-shell-v4`, `senvamily-static-v4`) so previously cached assets are cleaned up on activate without disrupting offline fallback or existing push subscriptions.
- **Push Notifications:** Default notification title in `sw.js` and fallback body in `src/features/notifications/logic.ts` now identify **Senvamily**. VAPID keys and subscription records are untouched.

---

## 7. Environment Variables Requiring Manual Configuration

| Variable | Value | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | `Senvamily` | Optional override (defaults to `"Senvamily"` in `src/lib/env.ts` and `src/config/site.ts`). |
| `EMAIL_SENDER_NAME` | `Senvamily` | Optional override for application email sender display name (defaults to `"Senvamily"`). |
| `NEXT_PUBLIC_APP_URL` | `https://famora-eight.vercel.app` | Already configured in Vercel Production & Preview; keep unchanged. |

---

## 8. Test & Build Results

- `npm run typecheck`: **PASS** (0 errors)
- `npm run lint`: **PASS** (0 errors)
- `npm test -- --run`: **PASS** (**39 test files, 177 tests passed**)
- `npm run build`: **PASS** (`16/16` static pages compiled, including `/opengraph-image`, `/icon.svg`, `/manifest.webmanifest`)
- `cd android && ./gradlew assembleRelease`: **PASS** (`android/app/build/outputs/apk/release/app-release.apk`, `2.9M`, `app_name = Senvamily`)
- *Note:* Live Web Push delivery, real Supabase email delivery, and Playwright E2E were not executed against production accounts in this pass.

---

## 9. Known Limitations

- Production deployment to Vercel (`https://famora-eight.vercel.app`) was intentionally not executed yet per instruction (*"Do not deploy to production until the implementation, verification, and final report are complete."*).
- Hosted Supabase Auth email templates and SMTP sender display name must be updated in the Supabase Dashboard.

---

## 10. Production Deployment Readiness Verdict

**`SENVAMILY_REBRANDING_COMPLETE_WITH_DEBT`** — Ready to push to `main` and deploy to Vercel production once you review this report and update the Supabase Auth email templates in the Dashboard.
