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

## 5. Remaining Manual Steps for User

1. **Re-install updated [app-release.apk](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/build/outputs/apk/release/app-release.apk)** on your Android phone (it now includes the Android App Links `<intent-filter android:autoVerify="true">`).
2. **Test a real signup** from the Famora mobile app (or mobile browser) at `https://famora-eight.vercel.app/signup`, confirm the verification email link points to `https://famora-eight.vercel.app/...` (no `localhost:3000`), tap **Verify Email**, and verify the redirect back to Famora.
