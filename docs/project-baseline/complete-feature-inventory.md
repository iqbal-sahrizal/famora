# Famora — Complete Feature Inventory

Status criteria are based on **actual backend + database + UI integration**, not UI presence alone.

---

## 1. Feature Status Distribution

| Status | Count | Modules / Routes |
| :--- | :---: | :--- |
| **Complete (with minor defects/hardening notes)** | 15 | Auth & Account, Onboarding, Members & Invites, Dashboard, Calendar, Tasks, Chores & Rewards, Shopping, Noticeboard & Polls, Chat, Documents Vault, Habits, Safety, Child Dev, Memories |
| **Partial (contains runtime query/aggregation bugs)** | 4 | Workspace Shell (`profiles.display_name` bug), Finance (`limit(60)` & archived balance bug), Settings (`deleteFamilyAction` bucket & RPC bugs), AI Assistant (`ai/context.ts` 4 column bugs + simulated streaming + missing usage log insert on stream) |
| **Env-Dependent / Partially Stubbed** | 2 | Notifications (Web Push RFC 8291 implemented, Email/WhatsApp out of scope/placeholder), PWA Sync (`shopping`/`tasks`/`calendar` implemented; `drafts` is a no-op stub) |
| **Intentional Demo / Fallback** | 2 | `/design-system` (`DesignShowcase`), `/f/[familyId]/[domain]` (`DomainShellView` catch-all) |

---

## 2. Detailed Module Inventory

| Module | Route(s) | Backend (`server.ts` / `actions.ts`) | Status | Key Findings |
| :--- | :--- | :--- | :--- | :--- |
| **Auth & Account** | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/account`, `/auth/callback` | `features/auth/` | Complete | PKCE callback, RHF + Zod, `id`/`en` localized. |
| **Onboarding & Workspace** | `/onboarding`, `/f/[familyId]/more`, `/f/[familyId]/[domain]` | `features/onboarding/`, `features/workspace/` | Partial | `workspace/server.ts:38` selects `profiles.display_name` (column is `full_name`). |
| **Members & Invites** | `/f/[familyId]/family`, `/invite/[token]` | `features/members/` | Complete | Invites, role changes, ownership transfer. Several actions rely on RLS without TS perm check. |
| **Settings & RBAC** | `/f/[familyId]/settings` | `features/settings/` | Partial | `deleteFamilyAction` fails on `0032` (`debt_payments` / FK) and uses wrong bucket `"family-chat"`. |
| **Dashboard** | `/f/[familyId]` | `features/dashboard/` | Complete | Quick actions lack TS perm checks (rely on RLS). |
| **Calendar** | `/f/[familyId]/calendar` | `features/calendar/` | Complete | Multi-step participant/notification writes not transactional. |
| **Tasks** | `/f/[familyId]/tasks` | `features/tasks/` | Complete | Multi-step calendar/subtask/history writes not transactional; `deleteTaskAction` lacks Zod. |
| **Chores & Rewards** | `/f/[familyId]/chores` | `features/chores/` | Complete | `myPointsBalance` sums only `.limit(40)` ledger entries (`chores/server.ts:112–150`). |
| **Shopping** | `/f/[familyId]/shopping` | `features/shopping/` | Complete | Realtime + IndexedDB offline queue; some actions lack TS perm checks. |
| **Noticeboard & Polls** | `/f/[familyId]/noticeboard` | `features/noticeboard/` | Complete | `createPollAction` non-transactional; RLS uses hardcoded `has_role`. |
| **Chat** | `/f/[familyId]/chat` | `features/chat/` | Complete | Realtime + private attachments; `deleteChatMessageAction` lacks sender/admin TS check. |
| **Finance Core** | `/f/[familyId]/finance` | `features/finance/` | Partial | `totalIncomeNumeric`/`totalExpenseNumeric` sum `.limit(60)`; `totalBalanceNumeric` includes archived accounts. |
| **Budgets, Bills & Analytics** | `/f/[familyId]/budgets`, `/f/[familyId]/analytics` | `features/finance/` (`budget-*`, `analytics-*`) | Complete | Atomic RPCs for bill pay, goal contribution, debt payment. |
| **Household (Home, Inventory, Meals)** | `/f/[familyId]/home`, `/inventory`, `/meals` | `features/household/` | Complete | Sequential writes ignore movement/history errors. |
| **Document Vault** | `/f/[familyId]/documents` | `features/documents/` | Complete | Storage bucket `family-documents` RLS does not check `documents.sensitive_vault`. |
| **Child Development** | `/f/[familyId]/child-dev` | `features/child-dev/` | Complete | `0021` + `0034` attachments; `child_dev.*` missing from TS `PermissionKey` catalog; storage policy lacks `health.view`. |
| **Habits** | `/f/[familyId]/habits` | `features/habits/` | Complete | Streak & completion tracking; `logHabitCompletionAction` lacks Zod. |
| **Memories** | `/f/[familyId]/memories` | `features/memories/` | Complete | Fixed `family_roles!inner(role_key)` & `families.privacy_settings`; lightbox is custom overlay. |
| **Safety** | `/f/[familyId]/safety` | `features/safety/` | Complete | Consent + expiration enforced; **0 unit tests** in `features/safety/`. |
| **Notifications & Push** | `/f/[familyId]/notifications` | `features/notifications/` | Partial | In-app + RFC 8291 VAPID Web Push implemented; Email/WhatsApp out of scope; `0027` RLS references unseeded `workspace.settings.manage`. |
| **AI Assistant** | `/f/[familyId]/ai`, `/api/ai/stream` | `features/ai/`, `app/api/ai/stream/route.ts` | Partial | `ai/context.ts` has 4 invalid column queries; stream is simulated post-generation and omits `ai_usage_logs` insert; falls back to `famora_local` without `OPENAI_API_KEY`. |
| **PWA Offline Sync** | Global (`AppShell` / `sw.js`) | `src/lib/pwa/` | Partial | `shopping`, `tasks`, `calendar` sync real actions; `drafts` is a no-op stub (`domain-sync.ts:183–185`). |

---

## 3. Roles & Permissions Summary

- **7 System Roles** (`0005`): `owner` (27 baseline + 3 child_dev = 30), `admin` (26 + 3 = 29), `adult` (19 + 3 = 22), `teen` (10), `child` (5), `extended` (3), `caregiver` (4).
- Per-member overrides (`allow` / `deny` / `inherit`) enforced in Postgres (`famora.has_permission`) and mirrored in `src/lib/security/permissions.ts` (`hasFamilyPermission`), with `is_managed_child` elevation blocked.
