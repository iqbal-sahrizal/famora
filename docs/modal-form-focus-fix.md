# Famora — P0 Modal Form Input Focus Fix

**Verdict:** `MODAL_FORM_FOCUS_FIXED_WITH_BLOCKERS`
**Date:** 2026-11-23
**Priority:** P0

---

## 1. Root Cause Analysis

Both `Dialog` and `BottomSheet` in `src/components/ui/dialog.tsx` share the `useDialogAccessibility(open, onClose, panelRef)` hook.

Previously, `useDialogAccessibility` included `onClose` in its `useEffect` dependency array:

```tsx
}, [open, onClose, panelRef]);
```

Every domain view (`shopping`, `tasks`, `chores`, `finance`, `noticeboard`, `habits`, `memories`, `settings`, `child-dev`, `calendar`, `chat`, `safety`, `household`, `members`, `dashboard`) passes an inline arrow function for `onClose` (for example, `onClose={() => setCreateOpen(false)}`).

Whenever the user typed a single character into a controlled `<Input>` or `<textarea>` inside a modal:
1. `onChange` updated React state in the parent view.
2. The parent re-rendered and created a new `onClose` function reference.
3. Because `onClose` was in `useDialogAccessibility`'s `useEffect` dependency array, React ran the effect cleanup (`prevFocused?.focus?.()`) and re-ran the effect body (`focusable[0]?.focus()`).
4. `focusable[0]` inside `Dialog` and `BottomSheet` is the header close button (`X`), so focus was immediately stolen from the active input after every single keystroke.

No unstable `key` props on `Dialog`/`BottomSheet` or nested component definitions inside render were found.

---

## 2. Fix Applied

- **`src/components/ui/dialog.tsx`**:
  - Stored `onClose` in a ref (`onCloseRef`) updated in a separate effect without dependencies.
  - Changed `useDialogAccessibility`'s main `useEffect` dependency array from `[open, onClose, panelRef]` to `[open, panelRef]`.
  - Guarded initial focus (`if (panel && !panel.contains(document.activeElement))`) so focus is moved into the modal only when it opens, and never stolen while the user types or interacts with controlled inputs/textareas inside the open modal.
  - Preserved Escape key closing via `onCloseRef.current()`, Tab focus trapping, body scroll locking, and restoring `prevFocused` when the modal closes.
- **`src/components/design-showcase.tsx`**:
  - Added controlled `Input` and `<textarea>` state (`eventTitle`, `eventNotes`, `itemName`, `itemNotes`) to the `Dialog` and `BottomSheet` demos so parent re-renders and inline `onClose` recreation are exercised on every keystroke.
- **`e2e/modal-focus.spec.ts`**:
  - Added Playwright regression tests verifying continuous multi-character typing without re-clicking, preserved input values, active focus retention (`toBeFocused()`), `<textarea>` typing, and form submission for both `Dialog` and `BottomSheet` in both `id` and `en` locales.

---

## 3. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| TypeScript | `npm --prefix famora run typecheck` | **Passed** (`0` errors) |
| ESLint | `npm --prefix famora run lint` | **Passed** (`0` errors) |
| Unit Tests | `npm --prefix famora test` | **Passed** (`32` test files, `137` tests passed) |
| Production Build | `npm --prefix famora run build` | **Passed** |
| Playwright E2E (Chromium) | `npm --prefix famora run test:e2e` | **6 passed, 3 skipped** (`23.0s`): `modal-focus.spec.ts` (`id` & `en` Dialog + BottomSheet input/textarea focus & submit) and `smoke-and-pwa.spec.ts` passed; 3 authenticated E2E specs skipped due to missing live Supabase credentials (`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`) |

---

## 4. Remaining Blocker

- **Authenticated Domain Modals (`BLOCKED`):** Live Chromium E2E verification of authenticated domain routes (`/f/[familyId]/*` for Shopping, Tasks, Finance, Noticeboard, Habits, Memories, Settings, Child Dev) remains blocked because no local/staging Supabase test credentials are configured in this environment. All of those modals share the exact `Dialog` and `BottomSheet` primitives fixed in `src/components/ui/dialog.tsx`.
