# Senvamily — Native Android In-App APK Updater

## 1. Architecture
- **Manifest API:** `GET /api/app-update/android` reads the latest enabled Android row from `public.app_releases` (no-store).
- **Version Policy (`src/lib/app-update/policy.ts`):** Compares installed `versionCode` against `versionCode` and `minimumSupportedVersionCode` (`up_to_date`, `optional`, `mandatory`, `disabled`). Never downgrades.
- **UI Gate (`src/components/updates/app-update-gate.tsx` & `app-update-modal.tsx`):**
  - Checks on startup (non-blocking for optional updates) and foreground (`visibilitychange`), plus `?update=1` deep link from push notifications.
  - Mandatory updates (`installedVersionCode < minimumSupportedVersionCode`) block dismissal.
- **Native Plugin (`android/app/src/main/java/app/famora/family/AppUpdaterPlugin.java`):**
  - `getAppVersion()` reads `PackageManager` `versionCode` & `versionName`.
  - `downloadAndVerifyApk()` enforces HTTPS + trusted host allowlist (`isTrustedApkUrl`), checks storage via `StatFs`, streams to `cacheDir/updates/senvamily-<versionCode>.apk`, emits `downloadProgress`, and verifies **SHA-256**.
  - `canRequestPackageInstalls()` & `openUnknownSourcesSettings()` handle Android 8+ unknown-sources permission.
  - `installApk()` launches Android's native installer via `FileProvider` (`${applicationId}.fileprovider` + `res/xml/file_paths.xml`).

## 2. Manifest Schema
```json
{
  "success": true,
  "platform": "android",
  "latestVersion": "1.2.0",
  "versionCode": 12,
  "minimumSupportedVersionCode": 10,
  "downloadUrl": "https://famora-eight.vercel.app/downloads/senvamily-1.2.0.apk",
  "releaseNotes": ["..."],
  "fileSize": 25000000,
  "sha256": "<64-char-hex>",
  "publishedAt": "2026-11-24T10:00:00Z",
  "enabled": true
}
```

## 3. Android Permissions & Security
- `android.permission.INTERNET`
- `android.permission.POST_NOTIFICATIONS`
- `android.permission.REQUEST_INSTALL_PACKAGES`
- Signing key & `applicationId` (`app.famora.family`) must remain identical across releases so Android preserves user data and allows in-place upgrades.
