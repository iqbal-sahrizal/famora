# Famora — Production Email Verification & Mobile App Redirect Fix Report

**Date:** 2026-11-24  
**Production URL:** `https://famora-eight.vercel.app`  
**Vercel Deployment:** `https://famora-8n5m0m6z8-iqbalsahrizal29s-projects.vercel.app` (aliased to `https://famora-eight.vercel.app`)  
**Supabase Project:** `eaxrhlgwsepdlfnveypo` (`Sahrizal Family`, `ap-northeast-1`)  
**Status:** **`EMAIL_VERIFICATION_AND_MOBILE_REDIRECT_DEPLOYED`**

---

## 1. Root Causes Identified

1. **Email Verification Link Pointed to `http://localhost:3000`:**
   - **Vercel Env:** `NEXT_PUBLIC_APP_URL` was not configured in Vercel Production, causing `src/lib/env.ts` to fall back to `.default("http://localhost:3000")`.
   - **Supabase Auth Config (`eaxrhlgwsepdlfnveypo`):** `site_url` was set to `"http://localhost:3000"` and `uri_allow_list` was `""` (empty).
2. **Mobile App Redirect & Cross-Context PKCE Failure:**
   - Famora uses an Android Capacitor wrapper (`app.famora.family`, pointing to `https://famora-eight.vercel.app`), which had **no Android App Links** (`<intent-filter android:autoVerify="true">` + `/.well-known/assetlinks.json`), so verification links opened in the external browser instead of returning to the Famora Android app.
   - Additionally, `/auth/callback` only handled PKCE `?code=...` (failing silently to `/login?error=verification_failed` when `token_hash` was used or when opened in a different browser context from the Capacitor WebView), and lacked a dedicated mobile-friendly verified confirmation screen.

---

## 2. Files Changed

- **[src/lib/env.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/lib/env.ts):** Added `PRODUCTION_APP_URL` and `resolveAppUrl(requestOrigin?)` — never returns `localhost` in `NODE_ENV === "production"`, even if `NEXT_PUBLIC_APP_URL` is unset or misconfigured.
- **[src/features/auth/actions.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/auth/actions.ts):** Updated `registerAction` and `forgotPasswordAction` to use `getActionAppUrl()` (from `headers()` + `resolveAppUrl`) so `emailRedirectTo` and `redirectTo` resolve to `https://famora-eight.vercel.app/auth/callback?...`.
- **[src/app/auth/callback/route.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/auth/callback/route.ts):** Added support for both PKCE `code` (`exchangeCodeForSession`) and `token_hash` + `type` (`verifyOtp`), prevented token logging, routed password recovery to `/reset-password`, and routed email confirmation to `/verify-email?status=verified&next=...` (or `?status=error&next=...`).
- **[src/app/(auth)/verify-email/page.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/(auth)/verify-email/page.tsx) & [src/app/(auth)/login/page.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/(auth)/login/page.tsx) & [src/lib/i18n/messages.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/lib/i18n/messages.ts):** Added localized (`id` & `en`), mobile-friendly (`min-h-[44px]` touch targets) `status=verified` and `status=error` UI states plus `?verified=1` login banner.
- **[public/.well-known/assetlinks.json](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/public/.well-known/assetlinks.json) & [android/app/src/main/AndroidManifest.xml](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/src/main/AndroidManifest.xml):** Configured verified Android App Links for `app.famora.family` on `https://famora-eight.vercel.app/auth/callback` and `/verify-email` using the release keystore's SHA-256 certificate fingerprint.
- **[src/features/auth/__tests__/email-verification-redirect.test.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/features/auth/__tests__/email-verification-redirect.test.ts):** Added 5 regression tests covering production URL resolution, zero-`localhost` signup/reset redirects, PKCE code exchange, `token_hash` OTP verification, and safe expired-token error handling.

---

## 3. Production Configurations Applied

1. **Vercel Environment Variables:**
   - Added `NEXT_PUBLIC_APP_URL=https://famora-eight.vercel.app` to both **Production** and **Preview**.
2. **Supabase Production Auth (`eaxrhlgwsepdlfnveypo` via Management API):**
   - `site_url`: `"https://famora-eight.vercel.app"`
   - `uri_allow_list`: `"https://famora-eight.vercel.app/auth/callback,https://famora-eight.vercel.app/verify-email,https://famora-eight.vercel.app/reset-password,https://famora-eight.vercel.app/**"`
   - Confirmed confirmation email template uses `SiteURL` / `ConfirmationURL` without hardcoded `localhost`.

---

## 4. Test, Build & Production Smoke Results

- `npm run typecheck`: **PASS** (0 errors)
- `npm run lint`: **PASS** (0 errors)
- `npm test -- --run`: **PASS** (**39 test files, 177 tests passed**, including 5 new tests in `email-verification-redirect.test.ts`)
- `npm run build`: **PASS** (Next.js 15.5.29 production build)
- Signed Release APK (`cd android && ./gradlew assembleRelease`): **PASS** (`android/app/build/outputs/apk/release/app-release.apk`, `2.9M`, includes updated `AndroidManifest.xml` App Links)
- GitHub `main` pushed (`2679a63`) and Vercel Production deployed (`https://famora-eight.vercel.app`, `Ready in 2m`).
- **Live Production Smoke Checks:** Verified `/.well-known/assetlinks.json`, `/verify-email?status=verified`, `/verify-email?status=error`, `/auth/callback` redirect location, and `/api/health`.

---

## 5. Branding Consistency, App Icons & Splash Screen

### Logo Consistency
- Audited all brand surfaces (`page.tsx`, `auth-shell.tsx`, `app-shell.tsx`, `public/icons/*`, `manifest.ts`, `layout.tsx`, and `android/app/src/main/res/*`).
- Identified mismatch: website UI used Lucide `HeartHandshake` on `#315C49` (`--accent-primary`) with `#F7F5EF` (`--accent-primary-fg`), whereas `public/icons/icon-192.svg` and generated PNG/Android icons previously used a solid filled heart on `#2F6B4E`.
- Created [brand-logo.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/components/ui/brand-logo.tsx) (`FamoraLogo`) as the single source of truth and wired it into `auth-shell.tsx` and the splash screen.

### App Icon Assets Updated
Regenerated all icons directly from the exact `HeartHandshake` vector paths on `#315C49` / `#F7F5EF`:
- **Favicon & Web SVG:** [src/app/icon.svg](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/icon.svg), [public/icons/icon-192.svg](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/public/icons/icon-192.svg), [public/icons/icon-512.svg](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/public/icons/icon-512.svg), referenced in [src/app/layout.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/layout.tsx).
- **PWA & Apple Icons:** `public/icons/icon-192.png` (192x192), `public/icons/icon-512.png` (512x512), `public/icons/icon-maskable-512.png` (512x512 full-bleed `#315C49` with safe-area padding), `public/icons/apple-touch-icon.png` (180x180 full-bleed `#315C49`), served by [src/app/manifest.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/manifest.ts) (`theme_color: "#315C49"`, `background_color: "#F7F5EF"`).
- **Android Launcher & Adaptive Icons:** Updated `ic_launcher.png`, `ic_launcher_round.png`, and `ic_launcher_foreground.png` across `mipmap-mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, and `xxxhdpi`.

### Splash Implementation
- **Web & PWA Splash/Loading:** Created [splash-screen.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/components/ui/splash-screen.tsx) (`FamoraSplashScreen`) and wired it to [src/app/loading.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/loading.tsx) and [src/app/(app)/f/[familyId]/loading.tsx](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/src/app/(app)/f/[familyId]/loading.tsx) with centered `FamoraLogo`, warm `#F7F5EF` / `#161917` canvas, `prefers-reduced-motion` support, and retry/login error fallback.
- **Android Native Splash:** Regenerated `splash.png` across `drawable` and all `drawable-port-*` / `drawable-land-*` densities with the centered `#315C49` `HeartHandshake` badge on `#F7F5EF`.

### Visual & Verification Status
- `npm run typecheck`, `npm run lint`, `npm test -- --run` (**39 files, 177 tests**), `npm run build`, and signed `app-release.apk` (`2.9M`) all **PASS**.

---

## 6. Remaining Manual Steps for User

1. **Re-install updated [app-release.apk](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/build/outputs/apk/release/app-release.apk)** on your Android phone (it now includes the Android App Links `<intent-filter android:autoVerify="true">`).
2. **Test a real signup** from the Famora mobile app (or mobile browser) at `https://famora-eight.vercel.app/signup`, confirm the verification email link points to `https://famora-eight.vercel.app/...` (no `localhost:3000`), tap **Verify Email**, and verify the redirect back to Famora.
