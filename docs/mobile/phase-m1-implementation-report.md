# Famora — Phase M1: Mobile Foundation & Navigation Report

**Verdict:** `MOBILE_M1_VERIFIED_WITH_BLOCKERS`
**Date:** 2026-11-23

---

## 1. Implementation Summary

### 1.1 Global Mobile Foundation
- **`src/app/globals.css`**: Added `--tint-sand` light/dark tokens (fixing `PwaStatusBar` undefined CSS variable), `overscroll-behavior-y: contain` on `html, body`, `-webkit-tap-highlight-color: transparent`, and a mobile `<640px` `16px` font-size floor for `input:not([type="checkbox"]):not([type="radio"]), select, textarea`.
- **`src/app/layout.tsx`**: Updated `body` to `min-h-dvh`, aligned `themeColor` with `#315C49` / `#161917`, and declared PNG `icons.icon` (`192x192`, `512x512`) and `icons.apple` (`180x180`).
- **`src/app/page.tsx` & `src/components/design-showcase.tsx`**: Wrapped headers (`flex-wrap gap-2`), added `overflow-x-clip`, `min-h-dvh`, safe-area top padding, and `min-h-11` header links so `/` and `/design-system` have zero horizontal overflow across all mobile viewports.
- **`src/components/layout/primitives.tsx`**: Added `flex-wrap` to `PageHeader` `actions`.

### 1.2 Mobile Bottom Navigation (`Home`, `Calendar`, `Tasks`, `Finance`, `More`)
- **`src/config/navigation.ts` & `src/lib/i18n/messages.ts`**: Updated `mobilePrimary` items to `dashboard` (`Home`/`Beranda`), `calendar` (`Calendar`/`Kalender`), `tasks` (`Tasks`/`Tugas`), and `finance` (`Finance`/`Keuangan`) with explicit `mobileLabelKey` entries.
- **`src/components/layout/app-shell.tsx`**: Removed `.split(" ")[0]` truncation, added `aria-current="page"`, `min-h-[44px]` touch targets, `pb-[calc(0.5rem+env(safe-area-inset-bottom))]` on the bottom bar, `pt-[calc(0.75rem+env(safe-area-inset-top))]` on the sticky header, `pb-[calc(5.5rem+env(safe-area-inset-bottom))]` on `<main>`, `min-h-dvh` root, `h-11 w-11` mobile account link, and `min-h-11 text-[16px] sm:text-[13px]` on the mobile family `<select>`.

### 1.3 Touch Targets (`>=44x44px`) & Input Font Size (`>=16px`)
- **`src/components/ui/input.tsx` & `select.tsx`**: `text-[16px] sm:text-[14.5px]`.
- **`src/components/ui/button.tsx`**: `sm` (`min-h-11 sm:min-h-0 sm:h-9`), `icon` (`h-11 w-11 sm:h-10 sm:w-10`).
- **`src/components/ui/dialog.tsx`**: `Dialog` and `BottomSheet` close buttons updated to `h-11 w-11 -mr-2`.
- **`src/components/ui/tabs.tsx`**: Horizontal scroll on mobile (`overflow-x-auto max-w-full`) with `min-h-11 sm:min-h-0` tab buttons.
- **`src/components/ui/date-picker.tsx`**: Popover clamped to `w-[min(22rem,calc(100vw-2rem))]`, prev/next buttons `h-11 w-11`, day cells `h-11 sm:h-9`.
- **`src/components/ui/navigation.tsx`**, **`src/features/auth/components/password-field.tsx`**, **`auth-shell.tsx`**, **`src/components/pwa/pwa-status-bar.tsx`**: Updated interactive buttons/toggles/links to `44x44px` minimum on mobile.

### 1.4 PWA PNG Icons & Manifest
- Generated PNG assets from Famora's heart artwork (`#315C49` Forest + `#F7F5EF` Warm White) in `public/icons/`:
  - `icon-192.png` (`192x192`)
  - `icon-512.png` (`512x512`)
  - `icon-maskable-512.png` (`512x512`, scaled `0.72` for Android maskable safe zone)
  - `apple-touch-icon.png` (`180x180`)
- Updated `src/app/manifest.ts` (`theme_color: "#315C49"`, `background_color: "#F7F5EF"`, PNG icon entries) and `public/sw.js` (precaches PNG icons + sets `icon`/`badge` in `showNotification`).

---

## 2. Before / After Chromium Viewport Measurements

| Route | Before (M0) | After (M1) |
| :--- | :--- | :--- |
| `/` (`320x720` – `390x844`) | `scrollWidth: 420` (Overflow) | `scrollWidth <= clientWidth` (**0 overflow**) |
| `/design-system` (`320x720` – `430x932`) | `scrollWidth: 460` (Overflow) | `scrollWidth <= clientWidth` (**0 overflow**) |
| `/login`, `/signup` (`375x812`) | Input `14.5px`; `Show password` `24x24px`; `Bahasa` `34x32px` | Input `16px`; `Show password` `>=44x44px`; `Bahasa` `>=44x44px` |
| `/design-system` Dialog (`375x812`) | Close button `32x32px`; Input `14.5px` | Close button `>=44x44px`; Input `16px` |
| `1280x800` Desktop | `0` overflow | `0` overflow (no regression) |

---

## 3. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| TypeScript | `npm --prefix famora run typecheck` | **PASS** (`0` errors) |
| ESLint | `npm --prefix famora run lint` | **PASS** (`0` errors) |
| Unit Tests | `npm --prefix famora test` | **PASS** (`33` test files, `144` tests passed, including `workspace-navigation.test.ts` `6/6`) |
| Production Build | `npm --prefix famora run build` | **PASS** |
| Playwright E2E (Chromium) | `npm --prefix famora run test:e2e` | **14 passed, 3 skipped** (`28.7s`; `mobile-m1.spec.ts` `8/8`, `modal-focus.spec.ts` `2/2`, `smoke-and-pwa.spec.ts` `4/4` passed; `3` authenticated E2E specs skipped) |

---

## 4. Remaining Limitations & Blockers

- **Chromium Emulation Only:** Mobile viewports (`320x720`–`430x932`) were verified in headless Chromium emulation; physical iOS Safari / Android Chrome device testing was not executed.
- **Authenticated `/f/[familyId]/*` Routes:** Live browser verification of `AppShell` mobile bottom navigation (`Home`, `Calendar`, `Tasks`, `Finance`, `More`) and authenticated domain views remains blocked without live Supabase test credentials (`3` E2E specs skipped; verified via unit tests and static checks).
- **Deferred to Phase M2+:** Domain-specific touch targets (`MOB-008`), Calendar 7-col mobile grid & Analytics horizontal chart scroll (`MOB-009`), Chat/AI keyboard layout (`MOB-010`), converting form `Dialog`s to `BottomSheet` (`MOB-011`), `DatePicker`/`Dropdown` edge clamping & `SpendBarChart` tap tooltips (`MOB-013`).
