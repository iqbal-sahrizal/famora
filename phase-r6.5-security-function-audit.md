# Famora — R6.5 Security Function Audit & Remediation Planning

**Date:** 2026-11-24  
**Scope:** Local migration SQL definitions (`0001`–`0037`) for all 12 prioritized functions + remaining `famora.*` / `public.*` RPCs  
**Verdict:** **`SECURITY_REMEDIATION_REQUIRED`**

> [!NOTE]
> Live production R6.4 `pg_proc` output (`prosecdef`, `proconfig`, `pg_get_functiondef`) was not yet supplied by the user; therefore, all findings below are evidenced directly from local migration SQL (`0001`–`0037`), and live production parity remains unverified until [r6.4_security_preflight.sql](file:///Users/iqbalsahrizal/Documents/CODING/Personal%20Project/famora/supabase/queries/r6.4_security_preflight.sql) is executed.

---

## 1. Executive Summary

Audit of the actual PL/pgSQL & SQL definitions across `0001`–`0037` found **7 confirmed security/concurrency/integrity vulnerabilities** and **4 potential/low-risk hardening items** requiring forward-only SQL remediation:

| # | Function | Classification | Risk | Summary |
|---|---|---|---|---|
| F-01 | `famora.redeem_family_reward` (`0015`) | **Confirmed Vulnerability** | **High** | Missing lock on member/ledger allows concurrent double-spend below 0 points. |
| F-02 | `famora.reverse_finance_transaction` (`0018`) | **Confirmed Vulnerability** | **High** | Missing personal-account ownership check & missing `FOR UPDATE` on `finance_accounts`. |
| F-03 | `famora.record_finance_transaction` (`0018`) | **Confirmed Vulnerability** | **High** | Missing personal-account check on transfer destination `v_dst`, opposing-transfer deadlock risk, & `is_archived` check (`0030`). |
| F-04 | `famora.cast_poll_vote` (`0017`) | **Confirmed Vulnerability** | **Medium** | Missing per-(poll, member) advisory lock allows concurrent votes to bypass `allow_multiple=false` / `allow_vote_edit=false`. |
| F-05 | `famora.record_debt_payment` (`0020`) | **Confirmed Vulnerability** | **Medium** | Allows additional payments on already-settled debts (`status = 'settled'`), inflating `finance_debt_payments` ledger. |
| F-06 | `famora.is_chat_participant` (`0024`) | **Confirmed Vulnerability** | **Medium** | `SECURITY DEFINER` `SET search_path = public, famora` omits `pg_temp`. |
| F-07 | `famora.set_member_permission_override` (`0011`) | **Potential Vulnerability** | **Medium** | Non-owner with `invite_manage` can grant sensitive permissions (`family.delete`, `invite_manage`) to other non-owners. |
| F-08 | `famora.transfer_family_ownership` (`0010`) | **Potential Vulnerability** | **Medium** | Locks target member `FOR UPDATE` but does not lock caller member row `FOR UPDATE`. |
| F-09 | `famora.accept_family_invitation` (`0007`) | **Potential Vulnerability** | **Low** | Does not explicitly check if user is already an active member of target family before `INSERT`. |
| F-10 | `famora.approve_chore_submission` (`0015`) | **False Positive / Low** | **Low** | Locks `v_sub FOR UPDATE` and is idempotent on `'approved'`; minor improvement to guard `'needs_retry'`/`'pending'`. |
| F-11 | `famora.pay_household_bill` (`0019`) | **False Positive (Safe)** | **Low** | Locks `v_bill FOR UPDATE`, rejects `status = 'paid'`, and passes deterministic `'bill:' || id` idempotency key. |
| F-12 | `famora.guard_family_member_mutation` (`0007`) | **False Positive (Safe)** | **Low** | `auth.uid() IS NULL` bypass is safe because `FORCE RLS` blocks `anon` from DML on `family_members`. |

---

## 2. Detailed Function-by-Function Audit

### 1. `famora.redeem_family_reward` (`0015_chores_and_rewards.sql:226-284`)
- **Status:** **Confirmed Vulnerability** | **Risk:** **High**
- **SQL Evidence:** Reads `SUM(delta_points)` from `reward_points_ledger` without acquiring any row lock on `family_members` or advisory lock.
- **Exploit / Inconsistency:** Two concurrent redemption requests under `READ COMMITTED` both read `v_balance = 100`, both pass `v_balance >= 100`, and both insert `-100` into `reward_points_ledger`, resulting in `-100` points.
- **SQL Fix:** Lock `public.family_members` (`SELECT id FROM public.family_members WHERE id = v_caller_member_id FOR UPDATE`) and acquire `pg_advisory_xact_lock(hashtext('reward_redeem:' || v_caller_member_id::text))` before computing `v_balance`.
- **App Compatibility:** 100% backward-compatible (same signature & return type).

### 2. `famora.record_finance_transaction` (`0018_family_finance_core.sql:124-242`)
- **Status:** **Confirmed Vulnerability** | **Risk:** **High**
- **SQL Evidence:**
  1. Checks `v_src.ownership_scope = 'personal' AND v_src.owner_member_id <> v_member_id`, but **does NOT check `v_dst`** on transfers (`lines 194-201`).
  2. Locks `p_account_id` then `p_transfer_account_id` without deterministic UUID ordering (`LEAST`/`GREATEST`), risking deadlocks on concurrent `A -> B` and `B -> A` transfers.
  3. Does not reject archived accounts (`is_archived = true` from `0030`).
- **SQL Fix:** Reject `is_archived = true` on `v_src` and `v_dst`; enforce `v_dst.ownership_scope = 'family' OR v_dst.owner_member_id = v_member_id`; lock accounts in sorted UUID order (`ORDER BY id FOR UPDATE`) when `p_kind = 'transfer'`; and guard `p_idempotency_key` with `pg_advisory_xact_lock` when provided.
- **App Compatibility:** 100% backward-compatible.

### 3. `famora.reverse_finance_transaction` (`0018_family_finance_core.sql:248-317`)
- **Status:** **Confirmed Vulnerability** | **Risk:** **High**
- **SQL Evidence:** Checks `finance.transactions.manage` and locks `v_tx FOR UPDATE`, **but never verifies personal-account ownership on `v_tx.account_id` / `v_tx.transfer_account_id` and never locks `finance_accounts` `FOR UPDATE` before updating `balance_numeric`**.
- **Exploit / Inconsistency:** A family member with `finance.transactions.manage` can reverse another member's personal-account transaction, and concurrent transactions/reversals on the same account risk lost balance updates or deadlocks.
- **SQL Fix:** Lock referenced `finance_accounts` row(s) `FOR UPDATE` in sorted UUID order and enforce `ownership_scope = 'family' OR owner_member_id = v_member_id`.

### 4. `famora.cast_poll_vote` (`0017_announcements_and_polls.sql:156-220`)
- **Status:** **Confirmed Vulnerability** | **Risk:** **Medium**
- **SQL Evidence:** Queries `family_polls` without `FOR SHARE`, counts `family_poll_votes`, deletes, and inserts without a per-(poll, member) lock.
- **Exploit / Inconsistency:** Concurrent requests on a single-choice poll (`allow_multiple = false`, `allow_vote_edit = false`) both read `v_existing_count = 0` and insert two different options for the same member.
- **SQL Fix:** Lock `family_polls` `FOR SHARE` and acquire `pg_advisory_xact_lock(hashtext('poll_vote:' || p_poll_id::text || ':' || v_member_id::text))` before checking `v_existing_count`.

### 5. `famora.record_debt_payment` (`0020_financial_analytics_and_goals.sql:170-211`)
- **Status:** **Confirmed Vulnerability** | **Risk:** **Medium**
- **SQL Evidence:** Locks `v_debt FOR UPDATE`, computes `GREATEST(0.00, v_debt.remaining_numeric - p_amount)`, but never checks `IF v_debt.status = 'settled' OR v_debt.remaining_numeric <= 0`.
- **Exploit / Inconsistency:** Double-clicking or retrying a debt payment records two `finance_debt_payments` rows whose sum exceeds `principal_numeric` while `remaining_numeric` clamps at `0.00`.
- **SQL Fix:** Reject `IF v_debt.status = 'settled' OR v_debt.remaining_numeric <= 0` and reject `IF p_amount > v_debt.remaining_numeric` (or cap cleanly only if explicitly desired — rejecting overpayment preserves exact accounting invariants).

### 6. `famora.is_chat_participant` (`0024_family_chat.sql:107-120`)
- **Status:** **Confirmed Vulnerability** | **Risk:** **Medium**
- **SQL Evidence:** `SECURITY DEFINER SET search_path = public, famora` omits `, pg_temp`.
- **Exploit / Inconsistency:** In PostgreSQL, omitting `pg_temp` from a `SECURITY DEFINER` function's `search_path` puts `pg_temp` **first** implicitly, allowing temp-object shadowing.
- **SQL Fix:** `ALTER FUNCTION famora.is_chat_participant(UUID) SET search_path = public, famora, pg_temp;` (or `CREATE OR REPLACE FUNCTION` in forward migration).

### 7. `famora.set_member_permission_override` (`0011_family_rbac_and_settings.sql:40-107`)
- **Status:** **Potential Vulnerability** | **Risk:** **Medium**
- **SQL Evidence:** Allows any member with `family.members.invite_manage` to grant `'allow'` on *any* permission key (including `family.delete` or `family.members.invite_manage`) to any non-owner member.
- **SQL Fix:** Restrict `family.delete` and `family.members.invite_manage` overrides (or overrides targeting `admin` members) to `owner` (`famora.member_role_key(p_family_id) = 'owner'`).

### 8. `famora.transfer_family_ownership` (`0010_member_management_and_invitations.sql:109-160`)
- **Status:** **Potential Vulnerability** | **Risk:** **Medium**
- **SQL Evidence:** Locks `v_target FOR UPDATE`, but does not lock `v_caller_member_id FOR UPDATE` before updating both rows.
- **SQL Fix:** Lock both `v_caller_member_id` and `p_target_member_id` in sorted UUID order (`ORDER BY id FOR UPDATE`).

### 9. `famora.accept_family_invitation` (`0007_anti_escalation_and_audit_triggers.sql:56-124`)
- **Status:** **Potential Vulnerability** | **Risk:** **Low**
- **SQL Evidence:** Does not explicitly check if `v_user_id` is already an active member of `v_inv.family_id`.
- **SQL Fix:** Check `IF EXISTS (SELECT 1 FROM public.family_members WHERE family_id = v_inv.family_id AND user_id = v_user_id AND status = 'active')` and mark/reject cleanly.

### 10–12. `approve_chore_submission`, `pay_household_bill`, `guard_family_member_mutation`
- **`approve_chore_submission` (`0015`):** Properly locks `v_sub FOR UPDATE` and short-circuits if `status = 'approved'`.
- **`pay_household_bill` (`0019`):** Locks `v_bill FOR UPDATE`, rejects `status = 'paid'`, and delegates to `record_finance_transaction` with `'bill:' || v_bill.id::text` idempotency.
- **`guard_family_member_mutation` (`0007`):** `auth.uid() IS NULL` bypass is safe because `FORCE ROW LEVEL SECURITY` prevents `anon` DML.

### Other `famora.*` Functions Reviewed
- `contribute_to_finance_goal` (`0020`): Locks `v_goal FOR UPDATE`, validates positive amount and `finance.transactions.manage` — safe.
- `process_due_recurring_schedules` (`0019`): Locks due `recurring_schedules` `FOR UPDATE`, uses per-run idempotency key `'sched:' || id || ':' || next_run_on` — safe.
- `delete_family_workspace` (`0035`): Owner-only + `family.delete` + `pg_temp` pinned — safe (pending deployment in R6.3).

---

## 3. Recommended Safe Remediation Order for Production

1. **First:** Complete R6.4 preflight (`r6.4_security_preflight.sql`) + confirm production backup/PITR + `pg_dump`.
2. **Second:** Apply pending baseline-alignment migrations from R6.3 (`0030` → `0031` → `0033` → `0034` → `0035` → `0036` → `0037`).
3. **Third:** Create & test forward-only migration `0038_security_function_hardening.sql` (from `supabase/queries/r6.5_security_findings.sql`) in an isolated local/staging DB with `r6.5_security_regression_tests.md`, then apply to production.
