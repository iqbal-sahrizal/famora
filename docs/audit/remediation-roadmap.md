# Famora — Ordered Remediation Roadmap

## Phase 1 — High-Priority Functional & UX Fixes (P1) — **IMPLEMENTED (`PHASE_1_VERIFIED_WITH_BLOCKERS`)**
1. **Fix `AUD-001` (PWA Failed Sync Retry)**: **UNIT_VERIFIED + BUILD_VERIFIED** — Live browser E2E `BLOCKED` (`playwright` / seeded DB unavailable).
2. **Fix `AUD-003` (Unified IndexedDB Offline Outbox & Cache)**: **UNIT_VERIFIED + BUILD_VERIFIED** — Live browser IndexedDB/reconnect E2E `BLOCKED`.
3. **Fix `AUD-002` (Account, Logout & Family Switcher in `AppShell`)**: **UNIT_VERIFIED + BUILD_VERIFIED** — Live multi-family browser E2E `BLOCKED`.

## Phase 2 — Medium-Priority CRUD Completeness (P2) — **IMPLEMENTED (`UNIT_VERIFIED; Live E2E & Live RLS BLOCKED`)**
4. **Fix `AUD-004` (Delete Family)**: **UNIT_VERIFIED** — Implemented `delete_family_workspace` RPC (`0032`), `deleteFamilyAction`, and Danger Zone confirmation dialog. Live E2E & Live RLS `BLOCKED`.
5. **Fix `AUD-005` & `AUD-006` (List & Announcement Edit/Delete)**: **UNIT_VERIFIED** — Implemented `updateShoppingListAction`, `deleteShoppingListAction`, `updateAnnouncementAction`, `deleteAnnouncementAction`, and UI sheets/dialogs. Live E2E & Live RLS `BLOCKED`.
6. **Fix `AUD-007` (Finance Account Edit/Archive)**: **UNIT_VERIFIED** — Implemented `0030_finance_accounts_archive.sql`, `updateFinanceAccountAction`, `archiveFinanceAccountAction`, and UI. Live E2E & Live RLS `BLOCKED`.
7. **Fix `AUD-008` & `AUD-009` (Notification Delete, Habit/Memory Edit)**: **UNIT_VERIFIED** — Implemented `0031_notifications_delete_policy.sql`, `deleteNotificationAction`, `updateHabitAction`, `updateMemoryAction`, and UI. Live E2E & Live RLS `BLOCKED`.

## Phase 3 — Advanced Features & Live Verification (P3) — **CODE IMPLEMENTED (`UNIT_VERIFIED + BUILD_VERIFIED; Live DB/E2E BLOCKED`)**
8. **Live Database & RLS Verification**: `BLOCKED` (Docker Desktop not running; `supabase` CLI & `psql` not installed; `TEST_DATABASE_URL` unset). Static `db:validate` passed across all 34 migrations.
9. **Playwright E2E, Lighthouse & Real-Device PWA/VAPID Tests**: `3 passed, 3 skipped` (`BLOCKED` on authenticated E2E without local/staging Supabase credentials).
10. **Fix `AUD-010` & `AUD-011`**: **UNIT_VERIFIED + BUILD_VERIFIED** — Implemented `id`/`en` internationalization (`0033`) and Child Development binary file attachments in private storage (`0034`).

## Phase 4 — Final Product Quality, UX & Functional Polish — **COMPLETE (`PHASE_4_READY_WITH_BLOCKERS`)**
11. **UX, Accessibility & Data-Integrity Polish**: Added modal/bottom-sheet focus trapping & restoration + unique `aria-labelledby` (`Dialog`/`BottomSheet`), `role="alert"` + `aria-describedby` (`Input`), `Skip to content` landmark (`AppShell`), `family-child-attachments` cleanup in `deleteFamilyAction`, and fixed SWC `LOCALE_COOKIE_NAME` re-export in `src/lib/i18n/index.ts`.
12. **Final Regression Gate**: `db:validate` (34 migrations), `typecheck`, `lint` (0 warnings), `vitest` (31 files / 129 tests), isolated `next build` (16 static pages, 39 routes), and Playwright smoke/PWA (`3 passed, 3 skipped`) all exited `0`. Live PostgreSQL RLS (`npm run test:rls`) and authenticated E2E remain `BLOCKED` awaiting Docker/Supabase.
