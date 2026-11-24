# Famora R6.4 — Production Preflight Security Verification

**Date:** 2026-11-24  
**Base Phases:** R6.3 (`MIGRATION_PLAN_READY_WITH_BLOCKERS`), [r6.3_production_migration_plan.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.3_production_migration_plan.sql)  
**Verdict:** **`SECURITY_PREFLIGHT_SQL_READY`**

---

## 1. Executive Summary

This phase audits all local `famora.*` functions across migrations `0001`–`0037`, validates `0035` independence from `0032`, verifies the full dependency order of `0030` → `0031` → `0033` → `0034` → `0035` → `0036` → `0037`, and provides [r6.4_security_preflight.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.4_security_preflight.sql) (`SELECT`-only) to verify live `prosecdef`, `proconfig`, ownership, `EXECUTE` privileges, and full definitions in production.

---

## 2. Local `famora.*` Function Security Baseline (`0001`–`0035`)

| Function | Migration | Returns | Security | `SET search_path` | Production Status |
|---|---|---|---|---|---|
| `famora.set_updated_at()` | `0001` | `TRIGGER` | `INVOKER` | `NONE` (trigger) | `PENDING_USER_EXECUTION` |
| `famora.validate_member_role_scope()` | `0003` | `TRIGGER` | `INVOKER` | `NONE` (trigger) | `PENDING_USER_EXECUTION` |
| `famora.is_family_member(UUID)` | `0006` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.current_member_id(UUID)` | `0006` | `UUID` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.member_role_key(UUID)` | `0006` | `TEXT` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.has_role(UUID, TEXT)` | `0006` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.has_permission(UUID, TEXT)` | `0006` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.guard_family_member_mutation()` | `0007` | `TRIGGER` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` *(PUBLIC EXECUTE expected for trigger)* |
| `famora.accept_family_invitation(TEXT)` | `0007` | `UUID` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.log_sensitive_activity()` | `0007` | `TRIGGER` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` *(PUBLIC EXECUTE expected for trigger)* |
| `famora.handle_new_user()` | `0008` | `TRIGGER` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` *(PUBLIC EXECUTE expected for trigger)* |
| `famora.create_family_with_owner(...)` | `0009` | `UUID` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.get_invitation_preview(TEXT)` | `0010` | `TABLE` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.reject_family_invitation(TEXT)` | `0010` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.transfer_family_ownership(UUID, UUID)` | `0010` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.get_my_family_permissions(UUID)` | `0011` | `TABLE` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.set_member_permission_override(...)` | `0011` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.approve_chore_submission(...)` | `0015` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.redeem_family_reward(...)` | `0015` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.cast_poll_vote(...)` | `0017` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.get_poll_vote_counts(UUID)` | `0017` | `TABLE` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.record_finance_transaction(...)` | `0018` | `UUID` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.reverse_finance_transaction(...)` | `0018` | `UUID` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.pay_household_bill(...)` | `0019` | `UUID` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.process_due_recurring_schedules(UUID)` | `0019` | `INTEGER` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.contribute_to_finance_goal(...)` | `0020` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.record_debt_payment(...)` | `0020` | `BOOLEAN` | `DEFINER` | `public, pg_temp` | `PENDING_USER_EXECUTION` |
| `famora.is_chat_participant(UUID)` | `0024` | `BOOLEAN` | `DEFINER` | `public, famora` *(no `pg_temp`)* | `PENDING_USER_EXECUTION` *(minor local hardening note)* |
| `famora.delete_family_workspace(UUID)` | `0035` | `BOOLEAN` | `DEFINER` | `public, famora, pg_temp` | `CONFIRMED_MISSING` (R6.2 Section 3) |

### Security Observations
- **Local `0024` Finding:** `famora.is_chat_participant(UUID)` in `0024_family_chat.sql` specifies `SET search_path = public, famora` without `, pg_temp`. Query 4 of `r6.4_security_preflight.sql` checks production for any `SECURITY DEFINER` function missing `pg_temp`.
- **Non-Trigger RPCs:** All non-trigger `famora.*` functions must show `can_execute = false` for `PUBLIC` and `anon`, and `true` only for `authenticated` (as needed by `public.*` `SECURITY INVOKER` wrappers).

---

## 3. Independence of Migration `0035` from `0032`

**Verified:** `0035_fix_delete_family_workspace_rpc.sql` does **NOT** depend on `0032_delete_family_workspace_rpc.sql`:
- `0035` uses `CREATE OR REPLACE FUNCTION famora.delete_family_workspace(p_family_id UUID)` and `CREATE OR REPLACE FUNCTION public.delete_family_workspace(p_family_id UUID)` — both work identically whether `0032` ran or not.
- `0035` references only base tables from `0002`–`0020` (`family_members`, `family_roles`, `families`, `finance_debt_payments`, `finance_goal_contributions`, `bill_payment_history`, `finance_transactions`, `finance_accounts`) and `famora.has_permission` (`0006`).

---

## 4. Dependency Verification for Proposed Migration Order

Order: **`0030` → `0031` → `0033` → `0034` → `0035` → `0036` → `0037`**:
1. **`0030`**: Depends only on `public.finance_accounts` (`0012`).
2. **`0031`**: Depends only on `public.notifications` (`0013`) and `famora.current_member_id` (`0006`).
3. **`0033`**: Depends only on `public.member_preferences` (`0003`).
4. **`0034`**: Depends on `families` (`0002`), `child_profiles` (`0021`), `family_members` (`0003`), `famora.set_updated_at` (`0001`), and `famora.has_permission` (`0006`). Must run **before `0036`**.
5. **`0035`**: Depends on `0002`–`0020` tables and `famora.has_permission` (`0006`). Independent of `0032` and `0034`.
6. **`0036`**: Replaces `storage.objects` policies for `family-documents` (`0023`) and `family-child-attachments` (`0034`). Must run **after `0034`**.
7. **`0037`**: Creates `family-tasks` & `family-noticeboard` buckets, adds `family_announcements.attachment_storage_path` (`0012`), and adds policies using `famora.is_family_member` & `famora.has_permission` (`0006`).

---

## 5. Next Step for User (Read-Only)

Run [r6.4_security_preflight.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.4_security_preflight.sql) in the Supabase Dashboard SQL Editor for `eaxrhlgwsepdlfnveypo` and return the results of Sections 1–5 before approving any migration execution.
