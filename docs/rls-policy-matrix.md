# Famora — Row-Level Security (RLS) Policy Matrix

## 1. Core RLS Helper Functions

To avoid slow N+1 subqueries and duplicate logic across 35+ tables, all RLS policies call indexed, `STABLE SECURITY DEFINER` PostgreSQL functions:

- `famora.is_family_member(p_family_id UUID) -> BOOLEAN`: Returns `true` if `auth.uid()` has an `active` row in `family_members` for `p_family_id`.
- `famora.current_member_id(p_family_id UUID) -> UUID`: Returns the caller's `family_members.id` for `p_family_id`.
- `famora.member_role(p_family_id UUID) -> TEXT`: Returns the caller's role in `p_family_id`.
- `famora.has_permission(p_family_id UUID, p_perm TEXT) -> BOOLEAN`: Evaluates `member_permission_overrides` (explicit `deny` > explicit `allow` > role default).

> **Performance Note**: `family_members` has a unique index on `(family_id, user_id) WHERE status = 'active'`, making these lookups single-index-probe O(1) operations.

---

## 2. RLS Policy Matrix by Table Group

Every table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` and `FORCE ROW LEVEL SECURITY;` (for non-owner roles).

| Table / Group | `SELECT` | `INSERT` | `UPDATE` | `DELETE` |
| :--- | :--- | :--- | :--- | :--- |
| `profiles` | `id = auth.uid()` OR shares an active family | `id = auth.uid()` | `id = auth.uid()` | Service role only |
| `families` | `is_family_member(id)` AND `deleted_at IS NULL` | Any authenticated user | `member_role(id) IN ('owner','admin')` | `member_role(id) = 'owner'` |
| `family_members` | `is_family_member(family_id)` | `has_permission(family_id, 'family.members.invite_manage')` | `has_permission(..., 'family.members.invite_manage')` OR self-display-name | `owner`/`admin` (cannot delete `owner`) |
| `family_invites` | `has_permission(family_id, 'family.members.invite_manage')` | Same | Same | Same |
| `member_permission_overrides` | `is_family_member(family_id)` | `member_role(family_id) IN ('owner','admin')` | Same | Same |
| `calendar_events` | `is_family_member(family_id)` AND (`visibility = 'family'` OR (`visibility = 'adults_only'` AND `has_permission(..., 'calendar.adults_only.view')`) OR (`visibility = 'private'` AND `created_by_member_id = current_member_id(family_id)`)) | `has_permission(family_id, 'calendar.family.manage')` | Creator OR `owner`/`admin` | Creator OR `owner`/`admin` |
| `tasks` & `task_lists` | `is_family_member(family_id)` | `has_permission(family_id, 'tasks.manage_all')` OR assigned self-create | `has_permission(..., 'tasks.manage_all')` OR (`assigned_member_id = current_member_id(family_id)` for status -> `pending_approval`/`done`) | `owner`/`admin`/`adult` (creator) |
| `finance_accounts`, `finance_categories`, `finance_transactions`, `finance_goals` | `has_permission(family_id, 'finance.accounts.manage')` OR (`owner_member_id = current_member_id(family_id)`) | `has_permission(family_id, 'finance.transactions.manage')` | Same (blocked if `deleted_at` immutable audit) | Soft-delete only (`owner`/`admin`) |
| `child_profiles`, `child_milestones`, `child_reward_points_ledger` | `is_family_member(family_id)` (restricted medical fields via view/RPC for `extended`) | `has_permission(family_id, 'child_dev.manage')` | Same | `owner`/`admin` |
| `shopping_lists`, `shopping_items` | `has_permission(family_id, 'shopping.manage')` OR `member_role` in `('child')` | `has_permission(family_id, 'shopping.manage')` | Same | `owner`/`admin`/`adult` |
| `inventory_items` | `has_permission(family_id, 'inventory.manage')` OR `teen`/`caregiver` read | `has_permission(family_id, 'inventory.manage')` | Same | `owner`/`admin`/`adult` |
| `documents` & `document_folders` | `sensitivity = 'standard'` AND `has_permission(..., 'documents.standard.manage')` OR (`sensitivity = 'sensitive_vault'` AND `has_permission(..., 'documents.sensitive_vault')`) | Same | Uploader OR `owner`/`admin` | `owner`/`admin` |
| `chat_channels`, `chat_messages` | `is_family_member(family_id)` AND channel membership (e.g., `adults_only` excludes `teen`/`child`/`extended`/`caregiver`) | `has_permission(family_id, 'chat.family.participate')` AND channel member | `sender_member_id = current_member_id(family_id)` (edit body) | Sender OR `owner`/`admin` (soft-delete) |
| `recipes`, `meal_plans` | `is_family_member(family_id)` | `has_permission(family_id, 'meals.manage')` | Same | `owner`/`admin`/`adult` |
| `home_assets`, `home_maintenance_tasks`, `home_contractors` | `has_permission(family_id, 'home.manage')` | Same | Same | `owner`/`admin` |
| `memory_albums`, `memories` | `is_family_member(family_id)` AND (`visibility = 'family'` OR `member_role IN ('owner','admin','adult')`) | `has_permission(family_id, 'memories.manage')` | Creator OR `owner`/`admin` | Creator OR `owner`/`admin` |
| `routines`, `habits`, `habit_logs` | `is_family_member(family_id)` | `has_permission(family_id, 'habits.manage_all')` OR own `member_id` | Own `member_id` OR `owner`/`admin`/`adult` | `owner`/`admin` |
| `emergency_contacts`, `safety_checkins`, `safety_medical_cards` | `is_family_member(family_id)` | `safety_checkins`: any active member (`safety.sos.trigger`); others: `owner`/`admin`/`adult` | `owner`/`admin`/`adult` | `owner`/`admin` |
| `notifications` | `recipient_member_id IN (SELECT id FROM family_members WHERE user_id = auth.uid())` | Service/Trigger only | Recipient (`read_at` only) | Recipient |
| `audit_logs` | `has_permission(family_id, 'audit_logs.view')` | Append-only via DB triggers / Service role | **DENIED (Immutable)** | **DENIED (Immutable)** |

---

## 3. Storage Bucket RLS (`storage.objects`)

All buckets use path convention: `{family_id}/{domain_entity_id}/{filename}`.
- `SELECT` / `INSERT` / `DELETE` policies parse `(storage.foldername(name))[1]::uuid` as `family_id` and validate `famora.has_permission(family_id, ...)`.
- `family-documents` requires `documents.sensitive_vault` for paths under `{family_id}/vault/...`.
