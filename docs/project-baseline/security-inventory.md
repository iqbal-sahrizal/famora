# Famora — Security Inventory

---

## 1. Access Control & RLS Architecture

- **Row-Level Security:** Enabled and forced (`ENABLE` + `FORCE ROW LEVEL SECURITY`) on all `79` `public.*` tables. Zero unrestricted `USING (true)` or `WITH CHECK (true)` policies (`db:validate` confirmed).
- **Least-Privilege Grants (`0006` + per-migration grants):**
  - All default privileges revoked from `PUBLIC`, `anon`, and `authenticated`.
  - Column-level `SELECT` grant on `public.family_members` excludes `pin_hash`.
  - Append-only / immutable tables: `finance_transactions` (`DELETE` revoked in `0018`), `reward_points_ledger` (`SELECT`-only for `authenticated`), `task_history`, `document_history`, `notification_delivery_logs`, `ai_usage_logs`.
- **Anti-Escalation & Audit Triggers (`0007`):**
  - `famora.guard_family_member_mutation()` prevents self-elevation and non-owner owner modifications.
  - `famora.log_sensitive_activity()` logs mutations on `family_members`, `member_permission_overrides`, and `family_invitations`.
- **AI Training Opt-Out (`0021`):**
  - `child_profiles` enforces `CHECK (ai_training_opt_out = true)`.

---

## 2. `SECURITY DEFINER` Functions & `public.*` RPC Wrappers

- **27 `SECURITY DEFINER` functions** in `famora.*`:
  - 6 RLS/role helpers: `is_family_member`, `current_member_id`, `member_role_key`, `has_role`, `has_permission` (`0006`), `is_chat_participant` (`0024`).
  - 3 trigger functions: `guard_family_member_mutation`, `log_sensitive_activity`, `handle_new_user`.
  - 18 business RPCs (17 exposed via `0029_public_rpc_wrappers.sql` + `delete_family_workspace` in `0032`).
- **Client Service-Role Hygiene:** `db:validate` verified zero `SUPABASE_SERVICE_ROLE_KEY` references in client directories (`src/{components,features,hooks,stores,providers}`).

---

## 3. Security Findings & Gaps

| Severity | Finding | Location |
| :---: | :--- | :--- |
| **HIGH** | `0027` RLS policies on `notification_outbox` & `notification_delivery_logs` check unseeded `'workspace.settings.manage'` (always evaluates `false`). | `0027_notification_system.sql:89,100,113` |
| **MEDIUM** | `family-documents` storage policy only checks `documents.standard.manage`, not `documents.sensitive_vault` for sensitive vault files. | `0023_family_document_vault.sql:116–129` |
| **MEDIUM** | `family-child-attachments` storage `SELECT` policy only checks `child_dev.identity.view`, bypassing `child_dev.health.view` enforced on `public.child_attachments`. | `0034_child_dev_attachments.sql:64–83` |
| **MEDIUM** | `famora.is_chat_participant` sets `search_path = public, famora` (missing `pg_temp`) and omits `access_expires_at` / `deleted_at IS NULL` checks; any chat participant can delete any attachment in `chat-attachments`. | `0024_family_chat.sql:107–127,259–265` |
| **LOW** | `0032` omits explicit `REVOKE ALL ... FROM PUBLIC, anon` on `famora.delete_family_workspace` / `public.delete_family_workspace`. | `0032_delete_family_workspace_rpc.sql` |
| **LOW** | `family_announcements` and `family_polls` RLS use hardcoded `has_role(..., ARRAY['owner','admin','adult'])` instead of `has_permission`. | `0012`, `0017` |
| **LOW** | `src/types/domain.ts` & `src/lib/security/permissions.ts` omit the 3 `child_dev.*` permissions from `0021`. | `src/lib/security/permissions.ts` |
| **LOW** | Several Server Actions omit TypeScript `get_my_family_permissions` checks before DB writes (relying solely on PostgreSQL RLS). | See `backend-integration-audit.md` |
