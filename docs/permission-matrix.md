# Famora — Granular Permission Matrix

## 1. Role Hierarchy & Philosophy

Famora combines **7 Family Roles** with **Per-Member Permission Overrides** (`allow` / `deny` in `member_permission_overrides`).

| Role | Description | Typical User |
| :--- | :--- | :--- |
| `owner` | Family creator/primary custodian. Cannot be removed without transferring ownership. | Primary Parent |
| `admin` | Co-manager with full operational control (except deleting the family). | Co-Parent / Partner |
| `adult` | Trusted adult member with full daily access; restricted from billing/destructive admin. | Adult Household Member |
| `teen` | Age-appropriate autonomy: own tasks, habits, chat, limited shopping/calendar. | Teenager (13–17) |
| `child` | Simplified, safe view: assigned chores, habits, rewards, family calendar (read). | Young Child (<13) |
| `extended` | Read-focused access to memories, shared calendar, and family chat. | Grandparent / Relative |
| `caregiver` | Scoped, optionally time-bound access to child routines, safety cards, and assigned tasks. | Babysitter / Nanny |

---

## 2. Permission Matrix by Domain

Legend: **F** = Full (Create/Read/Update/Delete), **C/R/U** = Create/Read/Update (own or shared), **R** = Read-Only, **A** = Assigned/Own Only, **—** = No Access.

| Permission Key / Domain | `owner` | `admin` | `adult` | `teen` | `child` | `extended` | `caregiver` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Family Management** | | | | | | | |
| `family.delete` | F | — | — | — | — | — | — |
| `family.settings.manage` | F | F | — | — | — | — | — |
| `family.members.invite_manage` | F | F | — | — | — | — | — |
| `family.members.view` | R | R | R | R | R | R | R |
| **Calendar** | | | | | | | |
| `calendar.family.manage` | F | F | C/R/U | C/R | R | R | R |
| `calendar.adults_only.view` | R | R | R | — | — | — | — |
| **Tasks & Chores** | | | | | | | |
| `tasks.manage_all` | F | F | C/R/U | A | A | — | A |
| `tasks.approve_chores` | F | F | F | — | — | — | — |
| **Family Finance** | | | | | | | |
| `finance.accounts.manage` | F | F | R | — | — | — | — |
| `finance.transactions.manage` | F | F | C/R/U | — | — | — | — |
| `finance.allowance.view_own` | R | R | R | R | R | — | — |
| **Child Development** | | | | | | | |
| `child_dev.manage` | F | F | C/R/U | — | — | — | R (notes) |
| `child_dev.rewards.redeem` | F | F | F | A | A | — | — |
| **Shopping & Inventory** | | | | | | | |
| `shopping.manage` | F | F | F | C/R/U | R | — | C/R |
| `inventory.manage` | F | F | F | R | — | — | R |
| **Documents** | | | | | | | |
| `documents.standard.manage` | F | F | C/R/U | R (shared) | — | — | R (care) |
| `documents.sensitive_vault` | F | F | Override | — | — | — | — |
| **Family Chat** | | | | | | | |
| `chat.family.participate` | F | F | F | F | C/R | C/R | C/R |
| `chat.adults_only.participate` | F | F | F | — | — | — | — |
| **Meal Planning & Home** | | | | | | | |
| `meals.manage` | F | F | F | C/R | R | — | R |
| `home.manage` | F | F | C/R/U | — | — | — | — |
| **Family Memories** | | | | | | | |
| `memories.manage` | F | F | C/R/U | C/R | R | R (react) | — |
| **Habits & Routines** | | | | | | | |
| `habits.manage_all` | F | F | A | A | A | — | R (child) |
| **Family Safety** | | | | | | | |
| `safety.contacts_medical.manage` | F | F | C/R/U | R | R | R | R |
| `safety.sos.trigger` | F | F | F | F | F | F | F |
| **AI Assistant & Audit** | | | | | | | |
| `ai.assistant.use` | F | F | F | F | Limited | — | — |
| `audit_logs.view` | R | R | — | — | — | — | — |

---

## 3. Override Resolution Rule & Step 09 Enforcement

1. Check if `family_members.status = 'active'` for `(family_id, auth.uid())` and `access_expires_at` is null or in the future.
2. Check `member_permission_overrides` (non-expired) for `(member_id, permission_key)`:
   - Explicit `deny` **always wins** over role default.
   - Explicit `allow` grants permission if not denied.
3. Otherwise fall back to the role's default matrix (`role_permissions`).
4. Managed Child sessions (`is_managed_child = true`) are capped at `child` permissions regardless of overrides.
5. **Anti-Self-Escalation**: `famora.set_member_permission_override()` and `famora.guard_family_member_mutation()` block any member from modifying their own `role_id`, `status`, or permission overrides.
6. **Owner Protection**: Only the active `owner` may transfer ownership (`famora.transfer_family_ownership()`), and `owner` permissions cannot be restricted via `member_permission_overrides`.
7. **Server & DB Dual Enforcement**: Every Server Action validates resolved permissions via `get_my_family_permissions(family_id)` before mutating, backed by PostgreSQL RLS policies.
