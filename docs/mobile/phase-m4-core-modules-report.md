# Famora — Phase M4: Mobile Core Modules Report

**Status:** `MOBILE_M4_VERIFIED_WITH_BLOCKERS`  
**Scope:** Calendar, Tasks & Chores, Shopping, Finance (including `SpendBarChart`), and `quickCompleteTaskAction` security hardening.

---

## 1. Summary of Implemented Changes

### A. Calendar (`src/features/calendar/`)
- **`src/features/calendar/actions.ts`**: Hardened `cancelCalendarEventAction` with UUID validation, active `family_members` membership verification, and `calendar.family.manage` permission enforcement.
- **`src/features/calendar/components/family-calendar-view.tsx`**:
  - Defaults `viewMode` to `"agenda"` on mobile viewports (`< 640px`) via `useEffect`.
  - Wraps 7-column `month` and `week` grids in `overflow-x-auto` with `min-w-[560px]` to prevent cell squeezing on `320px–430px`.
  - Converted day-add trigger to an accessible `<button>`, set `fullHeight` on the event editor `BottomSheet`, disabled `Edit` while `busy`, and upgraded `allDay` checkbox & participant pills to `min-h-11` on mobile.
  - Localized weekday labels, `+more`, `Decline`, `Edit`, and `Cancel Event` via `useLocale()`.

### B. Tasks & Chores (`src/features/tasks/`, `src/features/chores/`, `src/features/dashboard/actions.ts`)
- **`src/features/dashboard/actions.ts` (`quickCompleteTaskAction`)**: Enforced server-side authorization (authenticated user, active `family_members` row, task scoped to `family_id`, `tasks.manage_all` permission OR `assigned_member_id === actor.id` OR `task_assignees` row), wrote `task_history`, and revalidated dashboard & tasks paths.
- **`src/features/chores/server.ts` (`getChoresPageData`)**: Fixed `myPointsBalance` truncation by querying the full `reward_points_ledger` for `currentMember.id` instead of `.limit(40)`, and merged `pending_approval` `chore_submissions` so >30 reviewed rows cannot hide pending approvals.
- **`src/features/tasks/components/family-tasks-view.tsx`**:
  - Switched `selectedTask` state to `selectedTaskId` derived from `data.tasks` so refreshed subtasks/attachments stay in sync.
  - Added `{ value: "other", label: t("tasks.cat.other") }` to `categoryFilter`.
  - Added `toast.error(te(res.error))` in `handleToggleSubtask`.
  - Upgraded task toggle (`h-11 w-11` mobile hit area), subtask rows, attachment `"Add file"` label, assignee pills, and `syncToCalendar` label to `min-h-11` on mobile; set `fullHeight` on Task Editor `BottomSheet` and removed redundant inner `max-h-[75vh] overflow-y-auto`.

### C. Shopping (`src/features/shopping/`)
- **`src/features/shopping/schemas.ts` & `src/features/shopping/actions.ts`**: Added `updateShoppingItemAction` and `deleteShoppingItemAction` with Zod validation, active `family_members` check, and `shopping.manage` permission enforcement.
- **`src/features/shopping/components/family-shopping-view.tsx`**:
  - Fixed `visibleItems` list filter so unassigned items (`listId === null`) no longer leak into individual lists.
  - Added checked/total progress bar (`shopping.progressLabel`) and displayed `estimatedPriceCents` when `> 0`.
  - Added optimistic UI updates with rollback + `toast.error` on check toggle and quantity stepping, preserving unit suffixes (e.g., `"2 kg"` -> `"3 kg"`).
  - Upgraded list pills, history quick-add pills, quantity steppers, and item edit triggers to `min-h-11` / `h-11 w-11` on mobile.
  - Added `busy` guards and error toasts on template apply and history quick-add.
  - Added Edit Item `BottomSheet` (name, quantity, unit, category, estimated price, notes, delete).

### D. Finance & Charts (`src/components/ui/charts.tsx`, `src/features/finance/`)
- **`src/components/ui/charts.tsx` (`SpendBarChart`)**: Added tap/click and keyboard focus activation for bar tooltips and optional `currencyCode` / `locale` props.
- **`src/features/finance/server.ts`**: Excluded archived accounts from `totalBalanceNumeric` and computed `totalIncomeNumeric` / `totalExpenseNumeric` without `.limit(60)` truncation.
- **`src/features/finance/budget-server.ts`**: Excluded archived accounts (`.eq("is_archived", false)`) from `finance_accounts` query.
- **`src/features/finance/components/family-finance-view.tsx`**:
  - Initialized `txAccountId` and `txTransferDst` from non-archived accounts.
  - Blocked same-account transfers (`finance.transferSameAccount`) and hid the Category input when `txKind === "transfer"`.
  - Made hero balance responsive (`text-[28px] sm:text-[38px] break-words`) with wrapping summary row, highlighted negative account balances with `text-[var(--accent-danger)]`, passed `intlLocale` to `formatNumericCurrency`, and added Transaction Detail `BottomSheet` (`finance.txDetailTitle`).
- **`src/features/finance/components/family-analytics-view.tsx` & `family-budgets-bills-view.tsx`**:
  - Added `min-w-0 break-words` and responsive typography on period comparison cards with `intlLocale` formatting.
  - Wrapped monthly cash-flow bar chart in `overflow-x-auto` (`min-w-[480px]`) and added tap-to-inspect monthly income/expense summary banner.

### E. Localization (`src/lib/i18n/messages.ts`)
- Added 14 M4 translation keys (`calendar.*`, `shopping.*`, `finance.*`) in both `id` and `en` dictionaries.

---

## 2. Verification Results

| Check | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| Typecheck | `npm --prefix famora run typecheck` | **PASSED** (0 errors) | Run after all final source edits |
| Lint | `npm --prefix famora run lint` | **PASSED** (0 errors) | Run after all final source edits |
| Unit Tests | `npm --prefix famora test` | **PASSED** (`33` files, `147/147` tests) | Includes hardened `quickCompleteTaskAction`, `cancelCalendarEventAction`, `updateShoppingItemAction`, `deleteShoppingItemAction`, and `i18n` parity checks |
| Production Build | `npm --prefix famora run build` | **PASSED** | All routes built cleanly |
| Playwright E2E | `npm --prefix famora run test:e2e` | **32 passed, 5 skipped** | All unauthenticated/fail-closed 6-viewport overflow tests (`320x720`, `360x800`, `375x812`, `390x844`, `430x932`, `1280x800`), M1/M3 modal/i18n/PWA tests passed; 5 authenticated E2E tests (including 1 in `e2e/mobile-m4-core.spec.ts`) skipped because `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` are not configured locally. |

---

## 3. Verdict & Verification Debt

**Verdict:** `MOBILE_M4_VERIFIED_WITH_BLOCKERS`

- **Code, Static Analysis, Unit Tests, Production Build, & Unauthenticated E2E:** Verified passing.
- **Verification Debt / Blocker:** Authenticated browser E2E flows inside `/f/[familyId]/calendar`, `/tasks`, `/chores`, `/shopping`, `/finance`, `/budgets`, and `/analytics` remain skipped until isolated `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` credentials are provided.
