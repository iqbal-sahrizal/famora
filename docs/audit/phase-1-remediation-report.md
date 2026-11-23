# Famora — Phase 1 Remediation Report

**Date**: 2026-11-23  
**Scope**: `AUD-001`, `AUD-002`, `AUD-003` (Phase 1 Critical Remediation only)

---

## 1. `AUD-001` — PWA Failed-Sync Retry
- **Original Behavior**: Clicking `"sync issue · Retry"` in `PwaStatusBar` only called `refreshSummary()`, never replaying failed mutations.
- **Root Cause**: `usePwaSync` did not bind domain executors or expose a `retrySync()` function calling `flushOfflineOutbox({ forceRetryFailed: true })`.
- **Files Changed**:
  - `src/lib/pwa/types.ts`
  - `src/lib/pwa/sync-engine.ts` (added per-family concurrent flush lock `inFlightFlushByKey`, `isAuthExpiredErrorMessage`, and `PWA_OUTBOX_CHANGED_EVENT`)
  - `src/lib/pwa/domain-sync.ts` (new unified executor mapping `shopping`, `tasks`, `calendar`, and `drafts` to Server Actions)
  - `src/hooks/use-pwa-sync.ts` (auto-flush on `online` reconnect, `retrySync()`, `isSyncing`, `authExpired`)
  - `src/components/pwa/pwa-status-bar.tsx` (Retry button calls `retrySync()` with double-click lock & toast feedback)
- **Tests Executed**: `src/lib/pwa/__tests__/pwa-sync.test.ts` (6/6 passed).
- **Remaining Limitations**: Live browser offline/reconnect cycle in Playwright was not executed (`playwright` unavailable in CLI sandbox).
- **Final Status**: **Fixed (Code & Unit Verified; Live Browser E2E Pending)**

---

## 2. `AUD-002` — AppShell Account, Logout & Family Switcher
- **Original Behavior**: `AppShell` lacked `/account` navigation, Logout controls, and a Family Switcher.
- **Root Cause**: `FamilyWorkspaceLayout` did not load the user's active family memberships, and `AppShell` only rendered `DOMAIN_NAV_ITEMS`.
- **Files Changed**:
  - `src/features/workspace/server.ts` (`getWorkspaceShellContext`, `validateFamilySwitchTarget`)
  - `src/app/(app)/f/[familyId]/layout.tsx` (passes server-verified `shellContext` to `AppShell`)
  - `src/components/layout/app-shell.tsx` (permission-aware Family Switcher, Account link, and Sign Out confirmation `Dialog` clearing `useUiStore`)
  - `src/app/(app)/f/[familyId]/more/page.tsx` (added Account & Workspaces section on mobile)
- **Tests Executed**: `src/features/workspace/__tests__/workspace-navigation.test.ts` (3/3 passed).
- **Remaining Limitations**: Live multi-family browser switching E2E not executed (`playwright` unavailable).
- **Final Status**: **Fixed (Code & Unit Verified; Live Browser E2E Pending)**

---

## 3. `AUD-003` — Unified Offline Persistence & Synchronization
- **Original Behavior**: `Shopping` wrote offline mutations to `localStorage` (`offline-queue.ts`), while `Tasks`, `Calendar`, and `Dashboard` were not connected to IndexedDB `famora-pwa-db`.
- **Root Cause**: Step 14 shopping queue predated Step 26 IndexedDB `sync-engine.ts`.
- **Files Changed**:
  - `src/lib/pwa/sync-engine.ts` (added `calendar` domain support + `migrateLegacyShoppingQueue`)
  - `src/features/shopping/offline-queue.ts` (delegates to IndexedDB `famora-pwa-db` instead of `localStorage`)
  - `src/features/shopping/components/family-shopping-view.tsx` (caches snapshot in IndexedDB, awaits IndexedDB queue)
  - `src/features/dashboard/components/family-dashboard-view.tsx` (caches & reads `dashboard` snapshot from IndexedDB when offline)
  - `src/features/tasks/components/family-tasks-view.tsx` (caches `tasks` snapshot and enqueues `save_task`/`toggle_status` when offline)
  - `src/features/calendar/components/family-calendar-view.tsx` (caches `calendar` snapshot and enqueues `save_event` when offline)
- **Tests Executed**: `src/lib/pwa/__tests__/pwa-sync.test.ts` (6/6 passed).
- **Remaining Limitations**: Live browser IndexedDB & network-drop E2E verification pending staging Playwright run.
- **Final Status**: **Fixed (Code & Unit Verified; Live Browser E2E Pending)**
