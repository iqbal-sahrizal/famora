# Famora — Phase M3: Complete Mobile Form & Modal Inventory

---

## 1. Modal & Sheet Strategy

- **`BottomSheet` (Mobile bottom sheet -> Desktop `sm:` centered dialog):** Used for all create, edit, upload, and typed-confirmation forms so mobile users get bottom-anchored ergonomics (`rounded-t-[28px]`, safe-area padding, `max-h-[88dvh]` or `fullHeight` `max-h-[92dvh]`) while desktop users retain centered `sm:max-w-lg sm:rounded-[24px]` dialogs.
- **`Dialog` (Centered modal on all viewports):** Reserved for short destructive/action confirmations without text inputs and document previews (`app-shell` sign-out, `members` role/status confirm, `shopping` delete list confirm, `noticeboard` delete announcement confirm, `finance` archive account confirm, `child-dev` delete attachment confirm, `documents` preview).

---

## 2. Complete Form & Modal Inventory

| Module | File | Form / Modal | Container | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `auth/components/*-form.tsx`, `account-settings-view.tsx` | Login, Signup, Forgot/Reset Password, Account Profile/Password | Page `<form>` (RHF + Zod) | Verified (`>=16px` inputs, `44px` password toggle) |
| **Onboarding** | `onboarding/components/onboarding-wizard.tsx` | Create family + invites, Accept invite | Page `<form>` | Verified (`>=16px` mobile inputs) |
| **Dashboard** | `dashboard/components/family-dashboard-view.tsx` | Quick Add Task, Quick Add Shopping | `BottomSheet` | Focus & scroll-lock verified via `Dialog`/`BottomSheet` |
| **Members** | `members/components/members-directory-view.tsx` | Invite Member (`:412`) | **Converted `Dialog` -> `BottomSheet` (M3)** | Fixed for mobile keyboard ergonomics |
| **Members** | `members/components/members-directory-view.tsx` | Confirm Role / Ownership Transfer (`:481`) | `Dialog` | Confirmation-only (preserved) |
| **Calendar** | `calendar/components/family-calendar-view.tsx` | Event Detail (`:522`), Event Editor (`:642`) | `BottomSheet` | Controlled inputs, `16px` mobile floor |
| **Tasks** | `tasks/components/family-tasks-view.tsx` | Task Detail + Comment (`:505`), Task Editor (`:643`) | `BottomSheet` | Controlled inputs, `16px` mobile floor |
| **Chores** | `chores/components/chores-rewards-view.tsx` | Create Chore (`:428`), Add Reward (`:442`), Start Challenge (`:450`) | `BottomSheet` | Controlled inputs |
| **Shopping** | `shopping/components/family-shopping-view.tsx` | Inline Add Item (`:423`), Create List (`:649`), Edit List (`:674`) | Page `<form>` + `BottomSheet` | Delete list confirmation kept as `Dialog` (`:710`) |
| **Noticeboard** | `noticeboard/components/family-noticeboard-view.tsx` | Publish (`:489`), Edit (`:547`), Create Poll (`:633`) | `BottomSheet` | Delete announcement kept as `Dialog` (`:597`) |
| **Chat** | `chat/components/family-chat-view.tsx` | Inline Edit (`:1242`), Composer (`:1297`), New Chat (`:1355`) | Page `<form>` + `BottomSheet` | Keyboard/nav layout scheduled for M4 |
| **Finance** | `finance/components/family-finance-view.tsx` | Add Account (`:586`), Log Tx (`:639`), Reverse (`:724`), Edit Account (`:748`) | `BottomSheet` | Archive account kept as `Dialog` (`:800`) |
| **Budgets & Bills** | `finance/components/family-budgets-bills-view.tsx` | Budget (`:456`), Bill (`:469`), Schedule (`:482`), **Pay Bill (`:498`)** | `BottomSheet` (**Pay Bill converted from `Dialog` in M3**) | Select + action buttons inside `BottomSheet` |
| **Analytics** | `finance/components/family-analytics-view.tsx` | Goal (`:498`), Contrib (`:506`), Debt (`:513`), Pay Debt (`:523`) | `BottomSheet` | Controlled inputs |
| **Household** | `household/components/{home,inventory,meals}-view.tsx` | Assets, Maintenance, Inventory, Meal Plan, Recipe | `BottomSheet` | Controlled inputs |
| **Documents** | `documents/components/family-vault-view.tsx` | Upload Document, Preview (`:392`) | `BottomSheet` + `Dialog` (preview) | Preview kept as `Dialog` |
| **Child Dev** | `child-dev/components/child-development-view.tsx` | Profile, Milestone, Growth, Edu, Health, Attachment | `BottomSheet` | Delete attachment kept as `Dialog` (`:753`) |
| **Habits & Safety** | `habits/`, `safety/` | Create/Edit Habit, Safety Contact/Protocol/Location | `BottomSheet` | Controlled inputs |
| **Memories** | `memories/components/family-memories-view.tsx` | Capture Memory (`:851`), New Album (`:997`), Share (`:1039`), Edit (`:1093`) | `BottomSheet` | Custom lightbox (`:717`) deferred to M4 |
| **Settings** | `settings/components/family-settings-view.tsx` | Family Prefs (`:408`), **Delete Family Confirmation (`:677`)** | Page `<form>` + **Converted `Dialog` -> `BottomSheet` (M3)** | Typed confirmation `<Input>` now in `BottomSheet` |
| **Notifications & AI** | `notifications/`, `ai/` | Quiet Hours Prefs (`:348`), AI Prompt (`:325`) | Page `<form>` | Controlled inputs |
