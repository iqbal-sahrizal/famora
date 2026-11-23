# Famora — Complete Localization Audit & Remediation Report

**Verdict:** `LOCALIZATION_COMPLETE_WITH_BLOCKERS`
**Date:** 2026-11-23
**Default Locale:** Indonesian (`id`)
**Supported Locales:** Indonesian (`id`), English (`en`)

---

## 1. Executive Summary

Famora's localization across `src/` has been audited and remediated so that application-owned UI text, navigation, forms, modals, bottom sheets, dropdown options, empty/loading/error states, Zod validation messages, and Server Action error toasts consistently follow the selected locale (`id` default, `en` alternative).

Live browser verification in Chromium confirmed `id` default rendering, `ID`/`EN` switching, validation translation, and reload/cross-route cookie persistence (`famora_locale`) across public and authentication routes. Live authenticated browser verification of `member_preferences.locale` database persistence and authenticated `/f/[familyId]/*` routes remains blocked because no local or staging Supabase instance/test credentials are configured in this environment.

---

## 2. Root Causes Identified

1. **Partial component adoption:** Core navigation and shells used `useLocale()`, while domain views (`dashboard`, `shopping`, `calendar`, `habits`, `noticeboard`, `finance`, `notifications`, `memories`, `settings`, `child-dev`, `chores`, `household`, `ai`, `documents`, `safety`, `tasks`, `chat`, `onboarding`, `members`) still contained hardcoded English JSX text, `PageHeader`/`EmptyState`/`BottomSheet`/`Dialog` props (`title`, `description`, `label`, `actionLabel`), and `<Select>` option labels.
2. **Untranslated Server Action & Zod errors:** Server Actions return English error strings (asserted by existing unit tests), and client components passed `res.error` directly to `toast.error(res.error)` or `setError(res.error)`.
3. **Server-rendered auth/onboarding/error pages:** Server components needed request-cookie locale resolution (`getRequestLocale()`) to render localized metadata and initial copy without hydration mismatch.
4. **Duplicate keys in `messages.ts`:** Iterative additions introduced duplicate object keys (`TS1117`), which were deduplicated and verified with `tsc --noEmit` and `next build`.

---

## 3. Architecture & Key Changes

- **Server & Error Translation Helpers:**
  - `src/lib/i18n/server.ts` (`getRequestLocale()` reading `famora_locale` cookie, defaulting to `"id"`).
  - `src/lib/i18n/errors.ts` (`translateError(locale, errorOrCode?, fallbackKey?)` mapping Server Action errors, Zod validation strings, and dynamic `"Missing permission: ..."` prefixes).
  - `src/providers/locale-provider.tsx` (exposes `te` alongside `t` and `locale` via `useLocale()`).
  - `src/lib/i18n/messages.ts` (strict 1:1 `id`/`en` dictionary parity, deduplicated to 3,419 lines with zero duplicate keys).
- **Auth, Onboarding, Error Boundaries, & Shell:**
  - Localized `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/(app)/onboarding/page.tsx`, `src/app/(app)/account/page.tsx`, and auth routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`).
  - Added `ID`/`EN` quick toggle in `src/features/auth/components/auth-shell.tsx` and localized `login-form.tsx`, `register-form.tsx`, `forgot-password-form.tsx`, `reset-password-form.tsx`, and `account-settings-view.tsx`.
  - Localized `src/components/layout/app-shell.tsx` (including sidebar expand/collapse `aria-label`) and `src/components/ui/date-picker.tsx`.
- **All Domain Views Localized:**
  - `dashboard`, `shopping`, `calendar`, `habits`, `noticeboard`, `finance` (`family-finance-view.tsx`, `family-budgets-bills-view.tsx`, `family-analytics-view.tsx`), `notifications`, `memories`, `settings`, `child-dev`, `chores`, `household` (`home`, `inventory`, `meals`), `ai`, `documents`, `safety`, `tasks`, `chat`, `onboarding`, `members`, and `workspace/domain-shell-view.tsx`.
- **Automated Regression Guards:**
  - `src/lib/i18n/__tests__/i18n.test.ts`: enforces 1:1 `id`/`en` key parity, non-empty translations, `translateError` coverage, `useLocale`/`translate` usage across all feature/layout/PWA TSX files, zero hardcoded `toast.*("...")` literals, zero untranslated `toast.error(res.error)` calls, and zero hardcoded English UI props (`title`, `description`, `label`, `actionLabel`, `placeholder`).
  - `e2e/smoke-and-pwa.spec.ts`: browser E2E test verifying `id` default, `ID`/`EN` toggle, Zod validation translation, cookie persistence across reload, and cross-route navigation.

---

## 4. Before / After Examples

| Screen / Element | Before (Hardcoded English) | After (`id` Default) | After (`en` Selected) |
| :--- | :--- | :--- | :--- |
| Dashboard subtitle | `"Here is your household rhythm, upcoming plans, and shared reminders."` | `"Berikut ritme rumah tangga, rencana mendatang, dan pengingat bersama Anda."` | `"Here is your household rhythm, upcoming plans, and shared reminders."` |
| Child Dev tabs | `"Milestones"`, `"Growth Chart"`, `"Education"`, `"Health & Immunizations"` | `"Pencapaian"`, `"Grafik Pertumbuhan"`, `"Pendidikan"`, `"Kesehatan & Imunisasi"` | `"Milestones"`, `"Growth Chart"`, `"Education"`, `"Health & Immunizations"` |
| Settings RBAC matrix | `"Role Permission Matrix"`, `"Protected Capability"` | `"Matriks Izin Peran"`, `"Kapabilitas Terlindungi"` | `"Role Permission Matrix"`, `"Protected Capability"` |
| Memories tabs & modals | `"All Timeline"`, `"Capture a Memory"`, `"Important Moment"` | `"Semua Linimasa"`, `"Abadikan Kenangan"`, `"Momen Penting"` | `"All Timeline"`, `"Capture a Memory"`, `"Important Moment"` |
| Habits rate & units | `"{pct}% this week"`, `"times"`, `"minutes"` | `"{pct}% minggu ini"`, `"kali"`, `"menit"` | `"{pct}% this week"`, `"times"`, `"minutes"` |
| Notifications categories | `"Invitations"`, `"Bill Reminders"`, `"Family Activity"` | `"Undangan"`, `"Pengingat Tagihan"`, `"Aktivitas Keluarga"` | `"Invitations"`, `"Bill Reminders"`, `"Family Activity"` |

---

## 5. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| TypeScript | `npm --prefix famora run typecheck` | **Passed** (`0` errors) |
| ESLint | `npm --prefix famora run lint` | **Passed** (`0` errors) |
| Unit & Regression Tests | `npm --prefix famora test` | **Passed** (`32` test files, `137` tests passed, including `6/6` in `i18n.test.ts`) |
| Production Build | `npm --prefix famora run build` | **Passed** (all routes compiled cleanly) |
| Playwright E2E (Chromium) | `npm --prefix famora run test:e2e` | **4 passed, 3 skipped** (`15.4s`; public, PWA, and localization E2E passed; authenticated E2E skipped due to missing `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`) |

---

## 6. Remaining Blockers

- **Authenticated Live Verification (`BLOCKED`):** End-to-end browser verification of authenticated `/f/[familyId]/*` routes and live Supabase `member_preferences.locale` persistence could not execute because no local or staging Supabase project credentials (`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`) are configured in this environment. Unit tests (`i18n.test.ts`) verify `updatePersonalPreferencesAction` persistence logic against mocked Supabase clients.
