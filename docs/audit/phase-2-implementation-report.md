# Famora — Phase 2 Implementation Report

**Status:** `IMPLEMENTED_WITH_UNIT_VERIFICATION` (`Live E2E & Live PostgreSQL RLS BLOCKED`)
**Scope:** `AUD-005`, `AUD-006`, `AUD-007`, `AUD-008`, `AUD-009`, `AUD-004`

---

## 1. `AUD-005` — Edit & Delete Shopping List

- **Files Changed:**
  - `src/features/shopping/schemas.ts`
  - `src/features/shopping/server.ts`
  - `src/features/shopping/actions.ts`
  - `src/features/shopping/components/family-shopping-view.tsx`
  - `src/features/shopping/__tests__/shopping.test.ts`
- **Backend Integration:** Added `updateShoppingListAction` and `deleteShoppingListAction` with Zod validation (`updateShoppingListSchema`, `deleteShoppingListSchema`) and path revalidation (`/shopping`, dashboard).
- **Database Impact:** None (reuses `public.shopping_lists` and `shopping_items.list_id REFERENCES shopping_lists(id) ON DELETE CASCADE` from `0016_family_shopping_full.sql`).
- **Authorization Rules:** Both actions call `requireAuthenticatedUser()` and verify `shopping.manage` via `get_my_family_permissions`, scoped by `family_id`.
- **Tests Executed & Actual Results:** `vitest run src/features/shopping/__tests__/shopping.test.ts` — **7 passed (7)**.
- **Remaining Blockers:** Live browser E2E and live PostgreSQL RLS execution remain `BLOCKED` (Docker Desktop not running; `supabase` / `psql` not installed).

---

## 2. `AUD-006` — Edit & Delete Announcement

- **Files Changed:**
  - `src/features/noticeboard/schemas.ts`
  - `src/features/noticeboard/server.ts`
  - `src/features/noticeboard/actions.ts`
  - `src/features/noticeboard/components/family-noticeboard-view.tsx`
  - `src/features/noticeboard/__tests__/noticeboard.test.ts`
- **Backend Integration:** Added `updateAnnouncementAction` and `deleteAnnouncementAction` with `updateAnnouncementSchema` and `deleteAnnouncementSchema`, plus `canEditOrDelete` in `getNoticeboardData`.
- **Database Impact:** None (reuses `public.family_announcements` and `announcement_reads` cascade).
- **Authorization Rules:** Caller must be an active publisher (`owner`, `admin`, or `adult`) AND either `owner`/`admin` or the original `author_member_id` of the announcement, scoped by `family_id`.
- **Tests Executed & Actual Results:** `vitest run src/features/noticeboard/__tests__/noticeboard.test.ts` — **5 passed (5)**.
- **Remaining Blockers:** Live browser E2E and live PostgreSQL RLS execution remain `BLOCKED`.

---

## 3. `AUD-007` — Edit & Archive Finance Account

- **Files Changed:**
  - `supabase/migrations/0030_finance_accounts_archive.sql`
  - `src/features/finance/schemas.ts`
  - `src/features/finance/server.ts`
  - `src/features/finance/actions.ts`
  - `src/features/finance/components/family-finance-view.tsx`
  - `src/features/finance/__tests__/finance.test.ts`
- **Backend Integration:** Added `updateFinanceAccountAction` and `archiveFinanceAccountAction` (archive/restore), plus an archived-account guard in `recordFinanceTransactionAction`.
- **Database Impact:** Migration `0030_finance_accounts_archive.sql` adds `is_archived BOOLEAN NOT NULL DEFAULT false`, `archived_at TIMESTAMPTZ`, and `idx_finance_accounts_family_archived` on `public.finance_accounts`. Hard deletion of accounts is intentionally avoided to protect historical `finance_transactions` and `finance_audit_history`.
- **Authorization Rules:** Verified `finance.accounts.manage` via `get_my_family_permissions`, scoped by `family_id`, and preserved `owner_member_id` for `personal` accounts.
- **Tests Executed & Actual Results:** `vitest run src/features/finance/__tests__/finance.test.ts` — **7 passed (7)**.
- **Remaining Blockers:** Migration `0030` has not been executed against live PostgreSQL (`BLOCKED`).

---

## 4. `AUD-008` — Delete Notification

- **Files Changed:**
  - `supabase/migrations/0031_notifications_delete_policy.sql`
  - `src/features/notifications/actions.ts`
  - `src/features/notifications/components/family-notifications-view.tsx`
  - `src/features/notifications/__tests__/notifications-actions.test.ts`
- **Backend Integration:** Added `deleteNotificationAction` with Zod UUID validation and delete button per notification card.
- **Database Impact:** Migration `0031_notifications_delete_policy.sql` adds `notifications_delete_recipient` RLS policy (`FOR DELETE TO authenticated USING (recipient_member_id = famora.current_member_id(family_id))`).
- **Authorization Rules:** Requires active family membership and filters `.eq("family_id", ...).eq("recipient_member_id", actor.id)`.
- **Tests Executed & Actual Results:** `vitest run src/features/notifications/__tests__/notifications-actions.test.ts src/features/notifications/__tests__/notifications.test.ts` — **7 passed (7)**.
- **Remaining Blockers:** Live RLS test for `notifications_delete_recipient` remains `BLOCKED`.

---

## 5. `AUD-009` — Edit Habit & Memory Description

- **Files Changed:**
  - `src/features/habits/validation.ts`
  - `src/features/habits/actions.ts`
  - `src/features/habits/components/family-habits-view.tsx`
  - `src/features/habits/__tests__/habits-actions.test.ts`
  - `src/features/memories/validation.ts`
  - `src/features/memories/actions.ts`
  - `src/features/memories/components/family-memories-view.tsx`
  - `src/features/memories/__tests__/memories-actions.test.ts`
- **Backend Integration:** Added `updateHabitAction` (`updateHabitSchema`) and `updateMemoryAction` (`updateMemorySchema`) plus Edit `BottomSheet` forms in both views.
- **Database Impact:** None.
- **Authorization Rules:** `updateHabitAction` allows `owner_member_id` or `habits.manage_all`. `updateMemoryAction` allows `author_member_id` or `memories.manage` (except `private` memories, which only the author can edit).
- **Tests Executed & Actual Results:** `vitest run` on habits & memories test files — **10 passed (10)** across 4 files.
- **Remaining Blockers:** Live browser E2E and live PostgreSQL RLS execution remain `BLOCKED`.

---

## 6. `AUD-004` — Delete Family Workspace

- **Files Changed:**
  - `supabase/migrations/0032_delete_family_workspace_rpc.sql`
  - `src/features/settings/schemas.ts`
  - `src/features/settings/actions.ts`
  - `src/features/settings/components/family-settings-view.tsx`
  - `src/features/settings/__tests__/delete-family.test.ts`
- **Backend Integration:** Added `deleteFamilyAction` with exact family name confirmation, pre-deletion storage path collection (`family-documents`, `family-memories`, `family-chat`), atomic `delete_family_workspace` RPC call, and best-effort storage cleanup.
- **Database Impact:** Migration `0032_delete_family_workspace_rpc.sql` adds hardened `SECURITY DEFINER` `famora.delete_family_workspace(UUID)` + `public.delete_family_workspace(UUID)` wrapper, clearing `debt_payments`, `finance_transactions`, and `finance_accounts` in dependency order to prevent `ON DELETE RESTRICT` failures before cascading `DELETE FROM public.families`.
- **Authorization Rules:** Requires `family.delete` permission AND active `owner` role membership in `family_members`, plus exact `confirmationName === family.name`.
- **Tests Executed & Actual Results:** `vitest run src/features/settings/__tests__/delete-family.test.ts` — **3 passed (3)**.
- **Remaining Blockers:** Live atomic cascade & storage cleanup against local/staging Supabase remain `BLOCKED`.
