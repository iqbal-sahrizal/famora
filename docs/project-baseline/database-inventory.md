# Famora — Database Inventory

**Migrations:** `0001_` through `0034_` (`34` sequential files in `famora/supabase/migrations/`)
**Total `public.*` Tables:** `79` (all with `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `updated_at` triggers)

---

## 1. Migration Timeline Summary

- `0001`–`0011`: Extensions (`pgcrypto`), `famora` schema, core identity/families/roles/permissions, `family_members`, invitations, `member_preferences`, `user_devices`, `activity_logs`, RLS baseline, role/permission seeds, privilege hardening, `member_permission_overrides`, anti-escalation & audit triggers, `on_auth_user_created`, onboarding/family creation RPCs, privacy/preferences JSONB & `get_my_family_permissions`.
- `0012`–`0020`: Dashboard tables, Calendar & Notifications, Tasks (subtasks/comments/attachments/history), Chores & Rewards (`approve_chore_submission`, `redeem_family_reward`), Shopping + Realtime, Announcements & Polls (`cast_poll_vote`, `get_poll_vote_counts`), Finance Core (`record_finance_transaction`, `reverse_finance_transaction`, immutable ledger), Budgets & Bills (`pay_household_bill`, `process_due_recurring_schedules`), Financial Analytics & Goals (`contribute_to_finance_goal`, `record_debt_payment`).
- `0021`–`0028`: Child Development (+ 3 `child_dev.*` permissions), Household (Inventory/Recipes/Meals/Home), Document Vault (`family-documents` bucket), Chat (`chat-attachments` bucket + Realtime), Memories (`family-memories` bucket), Habits & Safety, Notification Outbox/Delivery Logs, AI Assistant (`ai_conversations`, `ai_messages`, `ai_usage_logs`).
- `0029`–`0034`: `public.*` RPC wrappers (17 functions), `finance_accounts.is_archived`, `notifications` delete policy, `delete_family_workspace` RPC, `member_preferences.locale`, `child_attachments` + `family-child-attachments` bucket.

---

## 2. Table Inventory by Domain (79 Tables)

| Domain | Count | Tables |
| :--- | :---: | :--- |
| Core, RBAC & Audit | 11 | `profiles`, `families`, `family_roles`, `permissions`, `role_permissions`, `family_members`, `family_invitations`, `member_preferences`, `user_devices`, `activity_logs`, `member_permission_overrides` |
| Calendar & Notifications | 5 | `calendar_events`, `calendar_event_participants`, `notifications`, `notification_outbox`, `notification_delivery_logs` |
| Tasks & Chores | 11 | `tasks`, `task_assignees`, `task_subtasks`, `task_comments`, `task_attachments`, `task_history`, `chore_templates`, `chore_submissions`, `reward_catalog`, `reward_points_ledger`, `family_challenges` |
| Shopping | 4 | `shopping_lists`, `shopping_items`, `shopping_templates`, `shopping_item_history` |
| Noticeboard & Polls | 5 | `family_announcements`, `announcement_reads`, `family_polls`, `family_poll_options`, `family_poll_votes` |
| Finance | 12 | `finance_accounts`, `finance_transactions`, `finance_categories`, `finance_audit_history`, `finance_budgets`, `recurring_schedules`, `household_bills`, `bill_payment_history`, `finance_goals`, `finance_goal_contributions`, `finance_debts_receivables`, `finance_debt_payments` |
| Child Development | 6 | `child_profiles`, `child_growth_records`, `child_milestones`, `child_education_records`, `child_health_records`, `child_attachments` |
| Household | 8 | `inventory_items`, `inventory_movements`, `recipes`, `meal_plans`, `home_assets`, `home_service_providers`, `home_maintenance_tasks`, `home_maintenance_history` |
| Documents | 2 | `documents`, `document_history` |
| Chat | 4 | `chat_conversations`, `chat_participants`, `chat_messages`, `chat_message_reactions` |
| Memories | 3 | `memory_albums`, `memory_items`, `memory_favorites` |
| Habits & Safety | 5 | `habits`, `habit_logs`, `safety_contacts`, `safety_protocols`, `safety_location_shares` |
| AI Assistant | 3 | `ai_conversations`, `ai_messages`, `ai_usage_logs` |

---

## 3. Private Storage Buckets (4)

| Bucket | Migration | Size Limit | Allowed MIME Types |
| :--- | :---: | :---: | :--- |
| `family-documents` | `0023` | 15 MB | PDF, JPEG, PNG, WEBP |
| `chat-attachments` | `0024` | 10 MB | JPEG, PNG, WEBP, GIF, PDF, TXT |
| `family-memories` | `0025` | 50 MB | JPEG, PNG, WEBP, GIF, MP4, WEBM, MOV |
| `family-child-attachments` | `0034` | 10 MB | PDF, JPEG, PNG, WEBP |

---

## 4. Database & Migration Inconsistencies

1. **`0032_delete_family_workspace_rpc.sql` (Runtime Crash):**
   - Line 45 references `public.debt_payments` (actual table is `public.finance_debt_payments`).
   - Deletes `finance_transactions` before `bill_payment_history`, violating `bill_payment_history.transaction_id` `ON DELETE RESTRICT` (`0019:74`).
2. **`0027_notification_system.sql` (Dead RLS Branch):**
   - Lines 89, 100, 113 check `famora.has_permission(family_id, 'workspace.settings.manage')`, which is never seeded (`family.settings.manage` is the seeded key).
3. **`scripts/validate-migrations.mjs` Blind Spots:**
   - `REQUIRED_TABLES` checks `78` tables and omits `child_attachments` (`0034`).
   - Hardcoded `securitySql` migration list omits `0024` (`is_chat_participant`) and `0032` (`delete_family_workspace`).
