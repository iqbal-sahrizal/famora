# Famora — PWA & Offline Audit

## Implemented Assets
- **Manifest**: `src/app/manifest.ts` (`/manifest.webmanifest`, `display: standalone`, theme `#2F6B4E`, background `#F8F6F1`, SVG icons `192x192` & `512x512`).
- **Service Worker (`public/sw.js`, `v2`)**: Pre-caches `/offline.html` and icons, invalidates old caches on `activate`, bypasses `/api/*`, `/auth/*`, `supabase.co`, `_rsc`, and localhost `/_next/static/`, and handles `SKIP_WAITING` + Web Push events.
- **IndexedDB & Sync Engine (`src/lib/pwa/`)**: `famora-pwa-db` stores `offline_cache` and `mutation_outbox`; `sync-engine.ts` blocks offline queueing for `finance`, `permissions`, and `sensitive_uploads`, and defines domain conflict rules (`tasks`, `shopping`, `drafts`).

## Defects & Gaps Identified
1. **`AUD-001` (FAIL)**: `PwaStatusBar` Retry button calls `refreshSummary()` rather than `flushOfflineOutbox({ forceRetryFailed: true })`.
2. **`AUD-003` (PARTIAL)**: `Shopping` uses `localStorage` (`offline-queue.ts`), while `Tasks`, `Calendar`, and `Dashboard` are not yet wired to `writeOfflineCache` / `enqueueOfflineMutation`.
3. **Browser & Device Verification (`BLOCKED`)**: Real installability (`beforeinstallprompt`), offline navigation, update lifecycle, Web Push dispatch, and iOS Safari 16.4+ standalone behavior were not tested on physical devices or Playwright.
