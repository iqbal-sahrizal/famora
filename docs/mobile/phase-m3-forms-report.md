# Famora — Phase M3: Mobile Forms, Dialogs & Bottom Sheets Report

**Verdict:** `MOBILE_M3_VERIFIED_WITH_BLOCKERS`
**Date:** 2026-11-23

---

## 1. Implementation Summary

### 1.1 Responsive Modal System (`src/components/ui/dialog.tsx`)
- **`Dialog`:** Added top/bottom safe-area viewport padding (`pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]`), `max-h-[85dvh]`, and `flex-wrap` on `footer` so multi-button actions never overflow on `320px` viewports.
- **`BottomSheet`:** Added `pt-[env(safe-area-inset-top)]` on the backdrop wrapper, optional `description` prop, and optional `fullHeight` prop (`max-h-[92dvh]` on mobile, `sm:max-h-[88dvh]` on desktop) while preserving centered `sm:max-w-lg sm:rounded-[24px]` desktop presentation.
- **Focus & Scroll Lock:** `useDialogAccessibility` maintains `onCloseRef` with `[open, panelRef]` dependencies (no focus loss on keystrokes), locks `document.body.style.overflow = "hidden"` while open, restores scroll and previous focus on close, and traps Tab/Escape.

### 1.2 Form-Bearing Modals Converted from `Dialog` to `BottomSheet`
- `src/features/members/components/members-directory-view.tsx`: Invite Member form (`inviteOpen`).
- `src/features/finance/components/family-budgets-bills-view.tsx`: Pay Bill form (`payTarget` `<Select>`).
- `src/features/settings/components/family-settings-view.tsx`: Delete Family confirmation with typed `<Input>` (`deleteDialogOpen`).

### 1.3 `Dropdown` Popover Hardening (`src/components/ui/dropdown.tsx`)
- Added `touchstart` outside-click listener, `aria-haspopup="menu"` / `aria-expanded` / keyboard activation on trigger, `max-w-[calc(100vw-2rem)]` viewport clamping, and `min-h-11` (`44px`) touch targets on mobile menu items.

---

## 2. Files Changed

- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown.tsx`
- `src/features/members/components/members-directory-view.tsx`
- `src/features/finance/components/family-budgets-bills-view.tsx`
- `src/features/settings/components/family-settings-view.tsx`
- `e2e/modal-focus.spec.ts`
- `docs/mobile/mobile-form-inventory.md`
- `docs/mobile/phase-m3-forms-report.md`
- `docs/mobile/mobile-defect-register.md`

---

## 3. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| TypeScript | `npm --prefix famora run typecheck` | **PASS** (`0` errors) |
| ESLint | `npm --prefix famora run lint` | **PASS** (`0` errors, `0` warnings) |
| Unit Tests | `npm --prefix famora test` | **PASS** (`33` test files, `145` tests passed) |
| Production Build | `npm --prefix famora run build` | **PASS** |
| Playwright E2E | `npm --prefix famora run test:e2e` | **26 passed, 4 skipped** (`41.5s`): `modal-focus.spec.ts` (`8/8` passed — `id` & `en` continuous typing, middle-cursor editing via `setSelectionRange`, `<textarea>` typing, `document.body.style.overflow === "hidden"` lock & restore, submit + all 6 viewports `320x720`–`1280x800` zero overflow + Escape close), `mobile-m1` (`8/8`), `mobile-m2-dashboard` (`6/7`), `smoke-and-pwa` (`4/4`) |

---

## 4. Remaining Limitations & Blockers

- **Authenticated Domain Form E2E (`BLOCKED`):** Live Playwright submission of authenticated domain forms (`/f/[familyId]/members`, `budgets`, `settings`, `tasks`, `shopping`, `calendar`, `finance`, `child-dev`) remains blocked without `E2E_SUPABASE_URL` / `E2E_SUPABASE_SERVICE_ROLE_KEY` test credentials.
- **Memories Lightbox (`MOB-011`):** Custom `fixed inset-0` media lightbox in `family-memories-view.tsx:717` remains scheduled for Phase M4 polish.
