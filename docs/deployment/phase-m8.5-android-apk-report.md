# Famora M8.5 — Android APK Build & Install Readiness Report

**Final Verdict:** `APK_BUILD_SUCCESS`  
**Date:** 2026-11-23

---

## 1. Platform Audit & Packaging Strategy

- **Initial Repo State:** No existing Android native project (`android/`), Capacitor config, or TWA manifest existed; Famora is a Next.js 15 App Router + Supabase SSR + PWA application.
- **Selected Strategy:** **Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`)** wrapping the HTTPS production URL (`https://famora-eight.vercel.app`, overridable via `CAPACITOR_SERVER_URL`).
  - **Why Capacitor over `next export`:** Famora relies on Server Components, Server Actions, `/api/ai/stream`, and `/auth/callback` SSR cookies (`@supabase/ssr`), which cannot run as a static `output: "export"` bundle.
  - **Offline Fallback Shell:** [capacitor-web/index.html](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/capacitor-web/index.html) provides a branded local fallback if the WebView cannot reach the server.

---

## 2. Android Project Configuration

- **Config:** [capacitor.config.ts](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/capacitor.config.ts) (`appId: "app.famora.family"`, `appName: "Famora"`, `cleartext: false`, `androidScheme: "https"`, `webContentsDebuggingEnabled: false`).
- **Build & Versioning:** [android/app/build.gradle](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/build.gradle) (`applicationId: "app.famora.family"`, `versionCode: 1`, `versionName: "1.0.0"`, `kotlin-bom:1.8.22` alignment, env-driven `signingConfigs.release` with zero hardcoded secrets).
- **Manifest & Keyboard/HTTPS:** [AndroidManifest.xml](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/src/main/AndroidManifest.xml) (`android:usesCleartextTraffic="false"`, `android:windowSoftInputMode="adjustResize"`, `INTERNET` permission).
- **Android Back Button:** [MainActivity.java](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/src/main/java/app/famora/family/MainActivity.java) registers `OnBackPressedCallback` to navigate WebView history back (`goBack()`) before exiting the app.
- **Icons & Splash:** Copied Famora's `public/icons/icon-192.png` and `icon-maskable-512.png` into `android/app/src/main/res/mipmap-*` with `#315C49` adaptive background ([ic_launcher_background.xml](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/android/app/src/main/res/values/ic_launcher_background.xml)).

---

## 3. Build Outputs & Signature Verification

| Artifact | Path | Size | Build Status | Signature Verification (`apksigner verify`) |
| :--- | :--- | :---: | :---: | :--- |
| **Debug APK** | `/Users/iqbalsahrizal/Documents/CODING/Personal Project/famora/android/app/build/outputs/apk/debug/app-debug.apk` | `3.8M` | **PASSED** (`assembleDebug`) | **VERIFIED** (`CN=Android Debug`, SHA-256 `3985fef3f4271e5e8b3239ad5364e30612e65c01fda8e68d1a00864ea8dc20ad`) |
| **Signed Release APK** | `/Users/iqbalsahrizal/Documents/CODING/Personal Project/famora/android/app/build/outputs/apk/release/app-release.apk` | `2.9M` | **PASSED** (`assembleRelease`) | **VERIFIED** (signed with `/tmp/famora-release.keystore`, `CN=Famora, OU=Mobile, O=Famora, L=Jakarta, ST=JK, C=ID`) |

---

## 4. Install Test Status, Known Limitations & Web vs Android Differences

- **Install & On-Device Smoke Test (`PASSED` on `Pixel_9_Pro_XL` / `47151FDASOO7DB`):**
  - `adb -s 47151FDASOO7DB install -r famora/android/app/build/outputs/apk/release/app-release.apk` → `Success`.
  - `adb -s 47151FDASOO7DB shell am start -W -n app.famora.family/.MainActivity` → `Status: ok`, `LaunchState: COLD`, `TotalTime: 383ms`.
  - Process verified running (`PID=7317`), Play Protect classification `NOT_HARMFUL`, WebView bound cleanly with `0` `FATAL EXCEPTION` / `AndroidRuntime` crashes in `logcat`.
- **Known Limitations / Web vs Android Differences:**
  1. **Live Server Dependency:** Because the app loads `https://famora-eight.vercel.app` (with `capacitor-web/index.html` fallback), initial launch requires internet connectivity, and the latest M1–M7.1 UI/API changes must be deployed to Vercel before the APK reflects them (currently `famora-eight.vercel.app` serves the previously deployed commit).
  2. **Web Push vs Native FCM:** In-WebView Web Push APIs (`Notification` / `PushManager`) behave differently inside Android WebView than in Chrome PWA; native FCM (`@capacitor/push-notifications` + `google-services.json`) is not configured yet.
  3. **Signing Keystore:** The release APK was signed using a temporary local keystore (`/tmp/famora-release.keystore`); for Play Store / long-term distribution, sign with your permanent production keystore via `FAMORA_KEYSTORE_PATH` / `FAMORA_KEYSTORE_PASS` / `FAMORA_KEY_ALIAS` / `FAMORA_KEY_PASS`.
