# Senvamily — Unified Android Release Process

## Release Checklist
1. **Bump Version** in `android/app/build.gradle`:
   - Increment `versionCode` (integer, strictly increasing).
   - Update `versionName` (e.g. `"1.1.0"`).
2. **Verify Code & Assets**:
   - `npm run typecheck && npm run lint && npm test -- --run`
   - `npm run db:validate`
   - `npx cap sync android`
3. **Build Signed Release APK**:
   - `cd android && ./gradlew assembleRelease`
   - Output: `android/app/build/outputs/apk/release/app-release.apk` (signed with `famora-release.jks`).
4. **Compute SHA-256 & File Size**:
   - `shasum -a 256 android/app/build/outputs/apk/release/app-release.apk`
   - `stat -f%z android/app/build/outputs/apk/release/app-release.apk`
5. **Upload APK to Trusted Production Storage**:
   - Upload as versioned filename `senvamily-<versionName>.apk` (do not overwrite older published APKs) to a trusted host (`famora-eight.vercel.app` or Supabase Storage public bucket).
   - Verify `curl -I <downloadUrl>` returns `HTTP 200`.
6. **Publish Release Manifest**:
   - Insert row into `public.app_releases` (`enabled = true`, `version_code`, `minimum_supported_version_code`, `download_url`, `sha256`, `file_size`, `release_notes`).
   - Verify `GET https://famora-eight.vercel.app/api/app-update/android` returns the new manifest.
7. **Trigger Update Push Notification**:
   - `POST https://famora-eight.vercel.app/api/app-update/android/notify` with `Authorization: Bearer $NOTIFICATIONS_DISPATCH_SECRET`.
   - Idempotent per `version_code` via `public.app_release_notifications`.

## Rollback Procedure
- Set `enabled = false` on the problematic row in `public.app_releases` immediately to stop new update prompts.
- To disable notification dispatch for a release, never delete `app_release_notifications`; publish a new higher `versionCode` with the fix.
