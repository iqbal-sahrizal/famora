# Famora PWA Platform Notes & Limitations

## Supported Capabilities
- **Web App Manifest**: Served at `/manifest.webmanifest` via `src/app/manifest.ts` with `display: standalone`, theme color `#2F6B4E`, background color `#F8F6F1`, and SVG icons (`/icons/icon-192.svg`, `/icons/icon-512.svg`).
- **Service Worker (`/sw.js`)**:
  - Pre-caches `/offline.html` and app icons.
  - Uses **Cache-First** for immutable `/_next/static/*` and `/icons/*` assets.
  - Uses **Network-First** with `/offline.html` fallback for page navigations.
  - Explicitly bypasses `/api/*`, `/auth/*`, `supabase.co`, and `_rsc` requests so private data is never cached indiscriminately.
  - Supports controlled updates via `SKIP_WAITING` and the UI "Update Ready" action.
- **IndexedDB Cache & Outbox**:
  - Stores offline cache snapshots (`dashboard`, `tasks`, `shopping`, `calendar`, `drafts`) and mutation outbox (`tasks`, `shopping`, `drafts`) in `famora-pwa-db`.
  - Financial transactions, permission changes, and sensitive uploads are intentionally excluded from offline queueing.

## Platform Behavior & Limitations
- **Chrome Desktop & Chrome Android**: Supports `beforeinstallprompt` install banner, standalone display, Background Sync / online recovery flush, and VAPID Web Push when HTTPS and VAPID keys are configured.
- **Safari iOS**: Does not fire `beforeinstallprompt`; installation requires Safari's Share -> "Add to Home Screen" flow (`appleWebApp` metadata is configured in `src/app/layout.tsx`). Web Push on iOS requires iOS 16.4+ and running from the installed Home Screen standalone app.
- **Safari Desktop**: Supports standalone "Add to Dock" (macOS Sonoma+) and Web Push; Service Worker storage quotas and private-browsing IndexedDB restrictions may limit offline cache persistence.
- **Verification Scope**: Automated Vitest tests verify the IndexedDB fallback store, offline domain restrictions, exponential backoff, conflict resolution, and queue recovery logic. Live device install/offline/update flows on physical Chrome Android, Safari iOS, and Safari Desktop hardware were not executed in this local CLI environment.
