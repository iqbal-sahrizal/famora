# Famora — Localization Implementation Report

**Date:** 2026-11-23
**Status:** **`LOCALIZATION_COMPLETE_WITH_BLOCKERS`**

---

## 1. Architecture & Persistence Improvements

1. **Expanded `id` (Default) and `en` Dictionaries (`src/lib/i18n/messages.ts`, `src/lib/i18n/index.ts`):**
   - Added comprehensive matching `id` and `en` keys across navigation, landing page, errors, PWA status bar, auth/account, onboarding/members, dashboard, calendar, tasks/chores, shopping, noticeboard, chat, finance/budgets/analytics, household/documents, child development, habits, memories, safety, AI, notifications, and settings.
   - Added `{param}` interpolation support in `translate(locale, key, params?)` and `useLocale().t(key, params?)`.
2. **Locale-Aware Date, Number, Time & Currency Formatting (`src/lib/i18n/format.ts`):**
   - Added `toIntlLocale`, `formatLocalizedDate`, `formatLocalizedTime`, `formatLocalizedDateTime`, `formatLocalizedNumber`, and `formatLocalizedRelativeTime`.
   - Updated `formatInTimezone` (`src/features/calendar/recurrence.ts`) to accept `locale` while preserving `"en"` backward compatibility when omitted.
3. **Cross-Session Member Locale Sync (`src/features/workspace/server.ts`, `src/app/(app)/f/[familyId]/layout.tsx`, `src/components/layout/app-shell.tsx`):**
   - `getWorkspaceShellContext` now loads `member_preferences.locale` for the active family.
   - `FamilyWorkspaceLayout` passes `syncMemberLocale` to `AppShell` when `famora_locale` cookie is absent (e.g., fresh browser or post-logout login) so `LocaleProvider` and the cookie synchronize automatically without SSR hydration mismatch.

---

## 2. Integrated Screens & Components

- **SSR Landing & Shell:** `src/app/page.tsx`, `src/app/(app)/f/[familyId]/more/page.tsx`, `src/app/(app)/f/[familyId]/error.tsx`, `src/components/layout/app-shell.tsx`
- **Shared UI & PWA:** `src/components/pwa/pwa-status-bar.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/feedback.tsx`, `src/components/ui/date-picker.tsx`
- **Domain Views Integrated:** `FamilyDashboardView`, `FamilyShoppingView`, `FamilyNoticeboardView`, `FamilyNotificationsView`, `FamilyFinanceView`, `ChildDevelopmentView`, `FamilyHabitsView`, `FamilyMemoriesView`, `FamilyCalendarView`, `FamilySettingsView`

---

## 3. Remaining Scope / Blockers

- **Live Authenticated Locale Persistence E2E:** `BLOCKED` (requires running local/staging Supabase to test `member_preferences.locale` round-trip across logout/login in a real browser).
- **Secondary Sub-Form Strings:** Secondary modal fields/placeholders in some unedited domain views (`auth` forms, `onboarding-wizard.tsx`, `family-tasks-view.tsx`, `chores-rewards-view.tsx`, `family-chat-view.tsx`, `inventory-view.tsx`, `meals-view.tsx`, `home-view.tsx`, `family-vault-view.tsx`, `family-safety-view.tsx`, `family-ai-view.tsx`, `members-directory-view.tsx`, `family-budgets-bills-view.tsx`, `family-analytics-view.tsx`) retain English strings in places and can be migrated incrementally into `MESSAGES` using the existing `useLocale()` pattern without architectural changes.
