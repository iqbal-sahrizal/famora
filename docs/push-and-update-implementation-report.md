# Senvamily — Push Notification & Android APK Updater Implementation Report

**Date:** 2026-11-24  
**Verdict:** **`PUSH_AND_UPDATE_COMPLETE_WITH_DEBT`**

> **Why `WITH_DEBT`?** All database migrations, RLS policies, FCM & Web Push backend/client code, native Android `AppUpdaterPlugin`, Update UI, Settings/About Senvamily UI, automated unit tests, TypeScript/ESLint/Next.js build, Capacitor sync, and signed Android Gradle APK build are implemented and verified. Live FCM push delivery and real-device APK upgrade remain pending manual Firebase `google-services.json` + server credentials, migration `0040` execution in Supabase, and real-device verification.

---

## 1. Existing Architecture Findings
- Reused existing `public.notifications`, `public.notification_outbox`, `public.notification_delivery_logs`, `public.user_devices`, `public.member_preferences`, and RFC 8291 Web Push (`src/features/notifications/vapid.ts` + `public/sw.js`).
- Capacitor v8.6.2 (`@capacitor/core`, `@capacitor/android`) was installed without `@capacitor/push-notifications` or an APK updater plugin.

## 2. Implementation Summary
- **Push Notifications (FCM + Web Push):**
  - Added `@capacitor/push-notifications` and `PushInitializer` (`src/components/notifications/push-initializer.tsx`) for post-auth token registration, foreground toasts, validated deep-link tap routing, and logout device unregistration.
  - Added server-only FCM HTTP v1 dispatcher (`src/features/notifications/fcm.ts`), integrated into `outbox.ts` alongside VAPID Web Push.
  - Added `/api/notifications/devices` and `/api/notifications/dispatch`.
- **Android In-App APK Updater:**
  - Added `/api/app-update/android` (backed by `public.app_releases`) and `/api/app-update/android/notify` (idempotent release push trigger).
  - Implemented `AppUpdaterPlugin.java` (version lookup, HTTPS + trusted host download, `StatFs` storage check, SHA-256 verification, unknown-sources permission flow, `FileProvider` native installer launch).
  - Implemented `AppUpdateGate`, `AppUpdateModal`, and `AboutAndNotificationsCards` in Settings.

## 3. Files Changed / Created
- **Migrations:** `supabase/migrations/0040_fcm_and_app_releases.sql`
- **Backend & APIs:** `src/features/notifications/{types,logic,fcm,outbox,server}.ts`, `src/app/api/notifications/{devices,dispatch}/route.ts`, `src/app/api/app-update/android/{route,notify/route}.ts`, `src/lib/app-update/{types,policy,native-updater}.ts`
- **UI & Shell:** `src/components/notifications/push-initializer.tsx`, `src/components/updates/{app-update-modal,app-update-gate}.tsx`, `src/components/settings/about-senvamily-card.tsx`, `src/components/layout/app-shell.tsx`, `src/features/settings/components/family-settings-view.tsx`
- **Android Native:** `android/app/src/main/java/app/famora/family/{AppUpdaterPlugin,MainActivity}.java`, `android/app/src/main/res/xml/file_paths.xml`, `android/app/src/main/AndroidManifest.xml`, `package.json`
- **Tests & Docs:** `src/features/notifications/__tests__/fcm-and-routing.test.ts`, `src/lib/app-update/__tests__/app-update.test.ts`, `docs/{push-notification-implementation,android-in-app-update,senvamily-release-process,push-and-update-implementation-report}.md`

## 4. Database Migrations & RLS
- `0040_fcm_and_app_releases.sql`:
  - Extends `user_devices` (`android_fcm`, `fcm_token`, `app_version_code`, `app_version_name`) and `notifications.category` (`system_update`, `app_update`).
  - Adds `public.app_releases` (forced RLS: public `SELECT` only where `enabled = true`, writes restricted to `service_role`) and `public.app_release_notifications` (forced RLS: `service_role` only).
  - Verified with `npm run db:validate`.

## 5. Manual Production Configuration Required
1. **Supabase SQL Editor (`eaxrhlgwsepdlfnveypo`):** Apply `supabase/migrations/0039_fix_invitation_pgcrypto_search_path.sql` and `supabase/migrations/0040_fcm_and_app_releases.sql`.
2. **Firebase / FCM:**
   - Download `google-services.json` for `app.famora.family` into `android/app/google-services.json` before building the FCM-enabled release APK.
   - Set `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) in Vercel Production.
3. **Web Push & Dispatch Secrets (Vercel Production):**
   - Verify `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
   - Set `NOTIFICATIONS_DISPATCH_SECRET` (or `CRON_SECRET`) for `/api/notifications/dispatch` and `/api/app-update/android/notify`.

## 6. Automated & Real-Device Verification
- `npm run db:validate`: **PASS**
- `npm run typecheck`: **PASS**
- `npm run lint`: **PASS**
- `npm test -- --run`: **PASS** (including `fcm-and-routing.test.ts` and `app-update.test.ts`)
- `npm run build`: **PASS**
- `npx cap sync android && cd android && ./gradlew assembleRelease`: **PASS**
- **Real-device FCM & APK install test:** Not executed in this environment (requires `google-services.json` + physical Android device + published release row in `app_releases`).
