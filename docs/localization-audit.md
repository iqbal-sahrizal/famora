# Famora — Complete Localization Audit

**Date:** 2026-11-23
**Default Locale:** Indonesian (`id`)
**Additional Locale:** English (`en`)

---

## 1. Existing Architecture Assessment

- `src/lib/i18n/messages.ts` & `src/lib/i18n/index.ts`: Contained ~65 keys covering navigation labels, `AppShell`, `/more`, `FamilySettingsView` header/tabs/language selector, and `ChildDevelopmentView` attachments.
- `src/providers/locale-provider.tsx`: Provides `useLocale()` (`locale`, `setLocale`, `t`), updates `document.documentElement.lang` and `famora_locale` cookie.
- `src/app/layout.tsx`: Reads `famora_locale` cookie on SSR (default `"id"`).
- **Gap Identified:**
  1. Only `AppShell`, `/more`, `FamilySettingsView` (partial), and `ChildDevelopmentView` (attachments section only) used `useLocale()` / `translate()`.
  2. All other domain views, auth forms, landing page, `PwaStatusBar`, `ErrorState`, `DatePicker`, and `ChildDevelopmentView` tabs/forms contained hardcoded English strings.
  3. `FamilyWorkspaceLayout` (`src/app/(app)/f/[familyId]/layout.tsx`) did not sync `member_preferences.locale` from Supabase on login/workspace entry when the browser cookie was absent.
  4. Date, time, and number formatting across 20+ files hardcoded `"en-US"` or browser-default `undefined` instead of using the active `id` (`"id-ID"`) / `en` (`"en-US"`) locale.

---

## 2. Affected Files & Hardcoded String Findings

| Area | Affected Files | Hardcoded Findings |
| :--- | :--- | :--- |
| **Landing & Error Boundaries** | `src/app/page.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/(app)/f/[familyId]/error.tsx` | Hero copy, Sign In / Get Started CTAs, highlights, error fallback titles/descriptions |
| **Shared UI & PWA** | `src/components/pwa/pwa-status-bar.tsx`, `src/components/ui/feedback.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/date-picker.tsx`, `src/components/layout/app-shell.tsx` | Offline/Syncing/Pending/Retry/Install/Update pills, "Try again", Close aria-labels, `"en-US"` date picker |
| **Auth, Account & Onboarding** | `login-form.tsx`, `register-form.tsx`, `forgot-password-form.tsx`, `reset-password-form.tsx`, `auth-shell.tsx`, `account-settings-view.tsx`, `onboarding-wizard.tsx`, `invite-acceptance-card.tsx` | Form labels, placeholders, validation messages, invite accept/reject copy, logout/profile labels |
| **Dashboard** | `src/features/dashboard/components/family-dashboard-view.tsx`, `src/features/dashboard/server.ts` | Time-of-day greetings, section titles, quick actions, empty states, `"en-US"` date formatting |
| **Calendar** | `src/features/calendar/components/family-calendar-view.tsx`, `src/features/calendar/recurrence.ts` | View tabs (Month/Week/Day/Agenda), event modal/fields, RSVP badges, `"en-US"` formatter |
| **Tasks & Chores** | `family-tasks-view.tsx`, `chores-rewards-view.tsx` | Filters, priority/status labels, subtasks/comments, chore approval & reward redemption |
| **Shopping** | `family-shopping-view.tsx` | Quick-add bar, list switcher, templates, history, edit/delete list sheets & dialogs |
| **Noticeboard & Chat** | `family-noticeboard-view.tsx`, `family-chat-view.tsx` | Tabs, announcement/poll sheets, edit/delete dialogs, chat composer, reactions, typing/read receipts |
| **Finance, Budgets & Analytics** | `family-finance-view.tsx`, `family-budgets-bills-view.tsx`, `family-analytics-view.tsx`, `src/features/finance/money.ts`, `src/lib/utils.ts` | Account/transaction/budget/bill/goal/debt labels, reversal dialog, CSV export headers, currency/number locale |
| **Household & Vault** | `inventory-view.tsx`, `meals-view.tsx`, `home-view.tsx`, `family-vault-view.tsx` | Stock adjustments, meal plan days/slots, home assets/maintenance, document vault upload/preview/delete |
| **Child Dev, Habits, Memories, Safety** | `child-development-view.tsx`, `family-habits-view.tsx`, `family-memories-view.tsx`, `family-safety-view.tsx` | Child tabs & forms, habit consistency/edit sheet, memory lightbox/edit sheet, safety contacts & location consent |
| **Notifications, AI, Members, Settings** | `family-notifications-view.tsx`, `family-ai-view.tsx`, `members-directory-view.tsx`, `family-settings-view.tsx` | Notification categories/preferences/devices, AI quick prompts/confirmations, member roles/invites, RBAC/privacy/danger zone |
