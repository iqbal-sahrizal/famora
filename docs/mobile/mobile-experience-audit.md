# Famora — Phase M0: Mobile Experience Audit

**Audit Date:** 2026-11-23
**Audit Scope:** Read-Only Mobile UX, Responsive & PWA Audit
**Verdict:** `MOBILE_AUDIT_WITH_BLOCKERS`

---

## 1. Executive Summary

Famora already has a solid responsive foundation (`Tailwind CSS v4`, `viewportFit: "cover"`, `Dialog` / `BottomSheet` focus-retention fix, and a mobile bottom navigation bar in `AppShell`). However, **live Chromium inspection across 5 mobile viewports (`320x720`, `360x800`, `375x812`, `390x844`, `430x932`) and static code inspection across all 34 routes and 32 feature views** show that Famora still behaves like a responsive web app rather than a native-feeling Android/iOS mobile app:

1. **Horizontal Overflow on Mobile:** `/` overflows horizontally (`scrollWidth: 420px`) on `320px`, `360px`, `375px`, and `390px` viewports due to the non-wrapping top header (`ThemeToggle` + `Sign In` + `Get Started`). `/design-system` overflows (`460px`) across all 5 mobile viewports.
2. **Navigation Mismatch & Safe-Area Gaps:** `AppShell` bottom navigation currently renders `Dashboard`, `Calendar`, `Tasks`, `Shopping`, `More` instead of the target `Home`, `Calendar`, `Tasks`, `Finance`, `More`, and lacks `env(safe-area-inset-bottom)` padding. The sticky mobile top header also lacks `env(safe-area-inset-top)`.
3. **iOS Safari Input Auto-Zoom:** `Input` (`14.5px`), `Select` (`14.5px`), and `AppShell` family `<select>` (`12px`/`12.5px`) render below `16px`, triggering automatic Safari zoom on focus.
4. **Sub-44px Touch Targets:** Multiple interactive controls (`Button size="sm"` 36px, `size="icon"` 40px, `Dialog`/`BottomSheet` close 32px, `Tabs` 36px, `DatePicker` nav 28px & days 32px, `PwaStatusBar` pills 26px, `ThemeToggle` 40px, `Show password` 24px, task/shopping check circles 24–28px, chat inline actions 22px) fall below the 44x44px minimum.
5. **PWA Installability Gap (Android/iOS):** `public/icons/` contains only SVGs (`icon-192.svg`, `icon-512.svg`) with zero PNG icons or `apple-touch-icon`, blocking reliable Android WebAPK installability and iOS home-screen icons.
6. **Authenticated Mobile Routes Blocked in Live Browser:** Unauthenticated routes (`/`, `/login`, `/signup`, `/forgot-password`, `/design-system`, `/offline.html`) were inspected live in Chromium; authenticated `/f/[familyId]/*` routes could not be rendered live without local/test Supabase credentials (`MOBILE_AUDIT_WITH_BLOCKERS`).

---

## 2. Live Playwright Multi-Viewport Findings

Inspected in headless Chrome across `320x720`, `360x800`, `375x812`, `390x844`, `430x932`, and desktop `1280x800`:

| Viewport | Overflowing Routes (`scrollWidth / clientWidth`) | Desktop Regression |
| :--- | :--- | :--- |
| `320x720` | `/` (`420/320`), `/design-system` (`460/320`) | N/A |
| `360x800` | `/` (`420/360`), `/design-system` (`460/360`) | N/A |
| `375x812` | `/` (`420/375`), `/design-system` (`460/375`) | N/A |
| `390x844` | `/` (`420/390`), `/design-system` (`460/390`) | N/A |
| `430x932` | `/design-system` (`460/430`) | N/A |
| `1280x800` | None (`0` overflow) | Pass |

- **Modals (`375x812` & `1280x800`):** Both `Dialog` and `BottomSheet` locked `document.body.style.overflow = "hidden"`, preserved `INPUT` focus during typing (`"Mobile Test"`, `"Oat Milk"`), and retained full typed values.
- **iOS Font-Size Check (`<16px`):** Observed on `/login` (`2` inputs), `/signup` (`3` inputs), `/forgot-password` (`1` input), `/design-system` (`4` inputs).

---

## 3. Navigation, Header & Shell Findings

- **`src/config/navigation.ts:36–62`:** `mobilePrimary: true` is assigned to `dashboard`, `calendar`, `tasks`, `shopping`. `finance` (`:45`) is excluded from primary bottom nav.
- **`src/components/layout/app-shell.tsx`:**
  - Bottom bar (`:323`) lacks `pb-[calc(0.5rem+env(safe-area-inset-bottom))]` and truncates multi-word labels via `.split(" ")[0]` (`:341`).
  - Top header (`:269–313`) lacks `pt-[calc(0.75rem+env(safe-area-inset-top))]`; packs brand + `<select>` + `PwaStatusBar` + account icon + `ThemeToggle` on one row (crowds 320px–375px); sign-out is absent from mobile header.
  - Root container (`:109`) and `layout.tsx:61` use `min-h-screen` (`100vh`) instead of `min-h-dvh`.
- **`src/components/layout/primitives.tsx:47`:** `PageHeader` actions lack `flex-wrap`, causing overflow when 2–3 buttons appear (`chores`, `home`, `meals`, `finance`).
- **`src/components/pwa/pwa-status-bar.tsx:65`:** References undefined `var(--tint-sand)` CSS token.

---

## 4. PWA Compatibility (Android & iOS)

- **Strengths:** `public/sw.js` caches static assets & `/offline.html`, bypasses `/api/` & `/auth/` & `supabase.co`, and handles `push` / `notificationclick`. `src/app/layout.tsx` sets `viewportFit: "cover"` and `appleWebApp.capable: true`.
- **Gaps:**
  1. **Missing PNG Icons (`public/icons/`, `manifest.ts`):** Android Chrome WebAPK & iOS `apple-touch-icon` require `192x192` & `512x512` PNGs (plus `180x180` Apple touch icon); `icon-512.svg` uses `rx="112"` edge-to-edge which clips under Android `maskable` adaptive icons.
  2. **Theme/Background Color Mismatch:** `manifest.ts` & `layout.tsx` use `#2F6B4E` / `#F8F6F1` / `#141A16` instead of Famora's tokens (`#315C49` / `#F7F5EF` / `#161917`).
  3. **Overscroll / Pull-to-Refresh:** `globals.css` lacks `overscroll-behavior-y: contain` and `-webkit-tap-highlight-color: transparent`.
  4. **Push Icon:** `sw.js:111–114` omits `icon` / `badge` in `showNotification`.
