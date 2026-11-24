# Senvamily — Push Notification Implementation Guide

## 1. Architecture
Senvamily uses a dual-channel, outbox-backed notification architecture:
1. **Application Event** → `enqueueAndDispatchFamilyNotification(...)` (`src/features/notifications/outbox.ts`)
2. **Persistence & Deduplication** → `public.notifications` + `public.notification_outbox` (`UNIQUE(idempotency_key, channel)`)
3. **Preference & Quiet-Hours Gate** → `evaluateDeliveryDecision(...)` (`src/features/notifications/logic.ts`)
4. **Platform Dispatch**:
   - **Android Capacitor APK (`platform = 'android_fcm'`):** Firebase Cloud Messaging HTTP v1 (`src/features/notifications/fcm.ts`)
   - **Web / Installed PWA (`web`, `ios_pwa`, `android_pwa`, `desktop_pwa`):** RFC 8291 VAPID Web Push (`src/features/notifications/vapid.ts`) + Service Worker (`public/sw.js`)
5. **Delivery Logging & Retry** → `public.notification_delivery_logs` + exponential backoff (`30s, 120s, 600s, 1800s, 3600s`) via `/api/notifications/dispatch`.

## 2. Database Schema & RLS
- `public.notifications` (`0013`, `0027`, `0040`): Stores in-app history, `read_at`, `category` (including `system_update` & `app_update`), `idempotency_key`, and `push_status`. RLS restricts `SELECT`, `UPDATE`, and `DELETE` to the recipient member.
- `public.user_devices` (`0003`, `0040`): Stores `push_endpoint`/`push_p256dh`/`push_auth` (Web Push) and `fcm_token`/`app_version_code`/`app_version_name` (`android_fcm`). Strictly scoped to `auth.uid() = user_id`.
- `public.notification_outbox` & `public.notification_delivery_logs` (`0027`): Outbox queue and per-device audit trail with forced RLS.

## 3. Native Android FCM Setup
1. Create a Firebase project and register Android app `app.famora.family`.
2. Download `google-services.json` and place it at `android/app/google-services.json` (do **not** commit credentials to git).
3. Configure server environment variables in Vercel:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
4. Android channels created on startup in `MainActivity.java`:
   - `senvamily_family` (family activity)
   - `senvamily_updates` (app updates)

## 4. Web Push Setup
- Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (`mailto:...`).
- `public/sw.js` handles `push` and `notificationclick` while preserving offline caching.

## 5. Troubleshooting
- **Token not registered:** Ensure user is authenticated and permission is granted via `Settings → Notifikasi Push` or `/f/[familyId]/notifications`.
- **FCM `UNREGISTERED` / Web Push `404`/`410`:** Automatically marks `revoked_at` on `user_devices` to prevent repeated failures.
