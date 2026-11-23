# Famora — Phase M7: E2E, Accessibility & Performance QA Report

**Verdict:** `MOBILE_M7_VERIFIED_WITH_BLOCKERS`  
**Scope:** Pre-deployment mobile QA across E2E regression (M1–M6), Authenticated E2E infrastructure, Accessibility audit, Mobile Performance lab measurement, Responsive 6-viewport verification, and PWA/Offline security.

---

## 1. Pre-Test Audit & Test Coverage Matrix

| Area | Unit Tests (`Vitest`) | Unauthenticated / Lab E2E (`Playwright`) | Authenticated E2E (`Playwright`) | Status |
| :--- | :---: | :---: | :---: | :--- |
| M1 Foundation, Nav, Inputs (`>=16px`), Touch (`>=44px`) | Covered | 8 passed (`mobile-m1.spec.ts`) | — | Verified |
| M2 Dashboard | 5 passed | 6 fail-closed overflow passed | 1 skipped (`mobile-m2-dashboard.spec.ts`) | Verification Debt |
| M3 Modals (`BottomSheet`, `Dialog`, Focus, `id`/`en`) | Covered | 9 passed (`modal-focus.spec.ts`) | — | Verified |
| M4 Core Modules (Calendar, Tasks/Chores, Shopping, Finance) | Covered | 6 fail-closed overflow passed | 1 skipped (`mobile-m4-core.spec.ts`) | Verification Debt |
| M5 Comms (Chat, AI, Notifications, VAPID) | Covered | 6 fail-closed overflow passed | 1 skipped (`mobile-m5-comms.spec.ts`) | Verification Debt |
| M6 PWA (Manifest, Icons, SW v3, Offline, Cache Isolation) | 7 passed | 9 passed (`mobile-m6-pwa.spec.ts`) | — | Verified |
| M7 A11y, Web Vitals Lab & Cross-Module QA | — | 8 passed (`mobile-m7-qa.spec.ts`) | 1 skipped (`mobile-m7-qa.spec.ts`) | Verification Debt |
| AUD-001/002/003 & Smoke | Covered | 5 passed (`smoke-and-pwa.spec.ts`) | 3 skipped (`aud-001/002/003`) | Verification Debt |

---

## 2. Authenticated E2E Infrastructure Status (`BLOCKED`)

- **Checked variables:** `E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY`.
- **Actual finding:** `E2E_ENV=MISSING` in local shell and `.env.local`.
- **Fixture readiness:** `e2e/fixtures/test-data.ts` (`seedPhase1Fixtures`, `cleanupPhase1Fixtures`) is implemented with 4 isolated synthetic users (`userA` Owner A, `userB` Adult A, `userC` Owner B, `userD` Outsider) and 2 families (`familyA`, `familyB`).
- **How to unblock safely (without production credentials):**
  1. Provision an isolated local or dedicated Supabase test project (never production).
  2. Export `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` in the CI/test environment (never commit to git or expose to `NEXT_PUBLIC_*`).
  3. Re-run `npm --prefix famora run test:e2e`.

---

## 3. Accessibility Audit Results (`e2e/mobile-m7-qa.spec.ts`)

Tested at `375x812` in Chromium across `/`, `/login`, `/signup`, `/forgot-password`, `/design-system`, and `/offline.html`:
- **Heading hierarchy:** Every audited route has `>= 1` `<h1>`.
- **Accessible names:** `0` visible buttons or links without accessible text/`aria-label`/`aria-labelledby`/`title`.
- **Form labels:** `0` visible `<input>`, `<select>`, or `<textarea>` elements without an associated `<label>`, `aria-label`, or `aria-labelledby`.
- **Modal & Keyboard:** `/design-system` `BottomSheet` opens with `role="dialog"` and closes cleanly on `Escape` without keyboard trap.
- **Manual checks not yet executed:** Screen reader (VoiceOver/TalkBack) traversal, reduced-motion OS toggle, and authenticated domain-page axe-core scans (blocked on `E2E_SUPABASE_*`).

---

## 4. Mobile Performance Lab Audit (`375x812`, Local Dev Server)

Measured via Chromium `PerformanceObserver` in `e2e/mobile-m7-qa.spec.ts` against `npm run dev -- -p 3010` (**local development measurement — not production CDN/field measurement**; `lighthouse` CLI is not installed locally):

| Route | Navigation Time | LCP (Lab Dev) | FCP (Lab Dev) | CLS | Transferred JS (Dev Unminified) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `/` | `830ms` | `108ms` | `108ms` | `0.0006` | `2908 KB` |
| `/login` | `882ms` | `108ms` | `108ms` | `0.0008` | `3254 KB` |

- **Production build bundle (`npm --prefix famora run build`):** Shared First Load JS is `102 kB`; route First Load JS ranges from `106 kB` (`/f/[familyId]/more`) to `273 kB` (`/f/[familyId]/chat`).
- **Note:** Production field Core Web Vitals (`LCP <= 2.5s`, `INP <= 200ms`, `CLS <= 0.1`) cannot be claimed solely from local dev measurements.

---

## 5. Responsive, Browser & Regression Results

| Check | Command | Result |
| :--- | :--- | :--- |
| Typecheck | `npm --prefix famora run typecheck` | **PASSED** (0 errors) |
| Lint | `npm --prefix famora run lint` | **PASSED** (0 errors, 0 warnings) |
| Unit Tests | `npm --prefix famora test` | **PASSED** (`33` files, `150/150` tests) |
| Production Build | `npm --prefix famora run build` | **PASSED** |
| Playwright E2E | `npm --prefix famora run test:e2e` | **55 passed, 7 skipped, 0 failed** |

- **Viewports verified:** `320x720`, `360x800`, `375x812`, `390x844`, `430x932`, `1280x800`.
- **Browser coverage:** Chromium `1.65.1` (`firefox` and `webkit` browsers are not installed in `~/Library/Caches/ms-playwright`; physical iOS/Android devices not tested).
- **CI Readiness:** `playwright.config.ts` uses `workers: 1`, `forbidOnly: Boolean(process.env.CI)`, `retries: process.env.CI ? 2 : 0`. Recommended CI commands:
  ```bash
  npm --prefix famora run typecheck
  npm --prefix famora run lint
  npm --prefix famora test
  npm --prefix famora run build
  npm --prefix famora run test:e2e
  ```

---

## 6. Verification Debt & Production Readiness Checklist

1. **P1 Verification Debt (7 Skipped Authenticated E2E Tests):** Supply isolated `E2E_SUPABASE_URL` and `E2E_SUPABASE_SERVICE_ROLE_KEY` and execute `aud-001`, `aud-002`, `aud-003`, `mobile-m2-dashboard`, `mobile-m4-core`, `mobile-m5-comms`, and `mobile-m7-qa` authenticated scenarios.
2. **P1 Push & Outbox Blockers (from M5):** Configure VAPID environment keys and service-role outbox dispatch worker if live Web Push is required for launch.
3. **P2 Cross-Browser & Device Testing:** Install/run WebKit & Firefox Playwright targets and verify on physical iOS Safari & Android Chrome before general release.
4. **P2 Production Lighthouse / Field RUM:** Run Lighthouse against the deployed production URL post-M8 to confirm production `LCP`/`INP`/`CLS`.
