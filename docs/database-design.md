# Famora — Database Design & Domain Boundaries

## 1. Design Principles & Step 04 Core Foundation

1. **Strict Tenant Partitioning**: Every domain table carries `family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE` (except global `profiles`, `families`, `permissions`, and `user_devices`).
2. **Multi-Family Membership Rule**: `profiles` **never** stores a global family role. All roles and permissions are assigned per-family in `family_members(family_id, user_id, role_id)`, validated by `famora.validate_member_role_scope()`.
3. **Incremental Safe Migrations**:
   - Migrations live in `supabase/migrations/` (`0001_...` through `0005_...`) and are strictly **additive/incremental**—previously applied migrations are never destructively modified.
   - All 10 core tables (`profiles`, `families`, `family_members`, `family_invitations`, `family_roles`, `permissions`, `role_permissions`, `member_preferences`, `user_devices`, `activity_logs`) use `UUID` primary keys, `created_at`/`updated_at` triggers (`famora.set_updated_at()`), check constraints, composite indexes, and `ENABLE` + `FORCE ROW LEVEL SECURITY`.
   - Zero unrestricted policies (`USING (true)`) and zero `SUPABASE_SERVICE_ROLE_KEY` usage in client code.
4. **Composite Indexing**: All high-volume tables index `(family_id, created_at DESC)` or `(family_id, status)` for fast RLS-filtered queries.
5. **Separation of Auth Identity & Family Member**: `auth.users` represents a login identity; `family_members` represents a person's membership in a specific family (allowing `user_id` to be `NULL` for Managed Child Profiles).

---

## 2. Database Domain Boundaries

Each domain owns its tables. Cross-domain references use **foreign keys to stable IDs** or **domain events**, avoiding tight coupling.

### Domain 1 & 2: Identity & Family Management (`core`)
- `profiles`: `id (PK, FK auth.users)`, `full_name`, `avatar_path`, `default_timezone`, `locale`, `preferences_jsonb`, `created_at`, `updated_at`
- `families`: `id (PK)`, `name`, `slug`, `timezone`, `currency_code`, `avatar_path`, `settings_jsonb`, `created_by`, `created_at`, `deleted_at`
- `family_members`: `id (PK)`, `family_id (FK)`, `user_id (FK auth.users, NULLABLE)`, `display_name`, `role` (`owner`, `admin`, `adult`, `teen`, `child`, `extended`, `caregiver`), `is_managed_child (BOOL)`, `pin_hash (TEXT, NULLABLE)`, `status` (`active`, `invited`, `suspended`, `removed`), `joined_at`
- `family_invites`: `id (PK)`, `family_id (FK)`, `email`, `intended_role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`
- `member_permission_overrides`: `id (PK)`, `family_id (FK)`, `member_id (FK)`, `permission_key`, `effect` (`allow`, `deny`), `granted_by`, `expires_at`

### Domain 4: Calendar (`calendar`)
- `calendar_events`: `id`, `family_id`, `created_by_member_id`, `title`, `description`, `start_at`, `end_at`, `all_day`, `timezone`, `rrule`, `location`, `visibility` (`family`, `private`, `adults_only`), `category`, `color`
- `calendar_event_attendees`: `id`, `family_id`, `event_id (FK)`, `member_id (FK)`, `rsvp_status` (`pending`, `accepted`, `declined`)
- `external_calendar_links`: `id`, `family_id`, `member_id`, `provider`, `ical_url_encrypted`, `last_synced_at`

### Domain 5: Tasks & Chores (`tasks`)
- `task_lists`: `id`, `family_id`, `title`, `type` (`general`, `chore_board`, `project`), `visibility`
- `tasks`: `id`, `family_id`, `list_id (FK)`, `title`, `description`, `assigned_member_id`, `created_by_member_id`, `status` (`todo`, `in_progress`, `pending_approval`, `done`), `priority`, `due_at`, `rrule`, `points_value`, `requires_approval`, `completed_at`, `approved_by_member_id`

### Domain 6: Family Finance (`finance`)
- `finance_accounts`: `id`, `family_id`, `name`, `type` (`checking`, `savings`, `cash`, `allowance_wallet`, `credit`), `currency`, `balance_cents`, `owner_member_id (NULLABLE)`, `is_shared`
- `finance_categories`: `id`, `family_id`, `name`, `kind` (`income`, `expense`), `icon`, `monthly_budget_cents`
- `finance_transactions`: `id`, `family_id`, `account_id (FK)`, `category_id (FK)`, `member_id (FK)`, `kind` (`income`, `expense`, `transfer`), `amount_cents`, `occurred_on`, `merchant`, `notes`, `receipt_document_id (FK NULLABLE)`, `is_recurring`, `rrule`, `deleted_at`
- `finance_goals`: `id`, `family_id`, `title`, `target_cents`, `current_cents`, `target_date`, `visibility`

### Domain 7: Child Development (`child_dev`)
- `child_profiles`: `id`, `family_id`, `member_id (FK)`, `birth_date`, `school_name`, `grade_level`, `blood_type`, `allergies_jsonb`, `pediatrician_info_encrypted`
- `child_milestones`: `id`, `family_id`, `child_member_id (FK)`, `category` (`physical`, `cognitive`, `social`, `academic`), `title`, `achieved_on`, `notes`, `memory_id (FK NULLABLE)`
- `child_reward_points_ledger`: `id`, `family_id`, `child_member_id (FK)`, `delta_points`, `reason`, `source_type` (`task`, `habit`, `redemption`, `manual`), `source_id`, `created_by_member_id`
- `child_rewards`: `id`, `family_id`, `title`, `cost_points`, `is_active`

### Domain 8: Shopping (`shopping`)
- `shopping_lists`: `id`, `family_id`, `name`, `store_name`, `is_archived`
- `shopping_items`: `id`, `family_id`, `list_id (FK)`, `name`, `quantity`, `unit`, `category`, `is_checked`, `checked_by_member_id`, `added_by_member_id`, `linked_inventory_item_id (FK NULLABLE)`, `updated_at`

### Domain 9: Inventory (`inventory`)
- `inventory_items`: `id`, `family_id`, `name`, `location` (`pantry`, `fridge`, `freezer`, `garage`, `medicine`, `other`), `quantity`, `unit`, `min_threshold`, `expires_on`, `warranty_expires_on`, `auto_add_to_shopping`, `document_id (FK NULLABLE)`

### Domain 10: Documents (`documents`)
- `document_folders`: `id`, `family_id`, `parent_id`, `name`, `sensitivity` (`standard`, `sensitive_vault`)
- `documents`: `id`, `family_id`, `folder_id (FK)`, `title`, `category` (`id_passport`, `medical`, `insurance`, `financial`, `warranty`, `school`, `other`), `storage_path`, `mime_type`, `size_bytes`, `sensitivity` (`standard`, `sensitive_vault`), `expires_on`, `uploaded_by_member_id`, `encrypted_dek_metadata`, `deleted_at`

### Domain 11: Family Chat (`chat`)
- `chat_channels`: `id`, `family_id`, `name`, `type` (`general`, `adults_only`, `direct`, `topic`), `created_by_member_id`
- `chat_channel_members`: `id`, `family_id`, `channel_id (FK)`, `member_id (FK)`, `last_read_at`
- `chat_messages`: `id`, `family_id`, `channel_id (FK)`, `sender_member_id (FK)`, `body`, `attachments_jsonb`, `reply_to_message_id`, `reactions_jsonb`, `created_at`, `edited_at`, `deleted_at`

### Domain 12: Meal Planning (`meals`)
- `recipes`: `id`, `family_id`, `title`, `prep_minutes`, `servings`, `ingredients_jsonb`, `instructions_md`, `dietary_tags`, `image_path`
- `meal_plans`: `id`, `family_id`, `planned_date`, `meal_slot` (`breakfast`, `lunch`, `dinner`, `snack`), `recipe_id (FK NULLABLE)`, `custom_title`, `assigned_cook_member_id`

### Domain 13: Home Management (`home`)
- `home_assets`: `id`, `family_id`, `name`, `category` (`appliance`, `hvac`, `vehicle`, `structure`), `serial_number`, `purchased_on`, `warranty_doc_id (FK NULLABLE)`
- `home_maintenance_tasks`: `id`, `family_id`, `asset_id (FK NULLABLE)`, `title`, `interval_days`, `last_completed_on`, `next_due_on`, `estimated_cost_cents`, `contractor_id (FK NULLABLE)`
- `home_contractors`: `id`, `family_id`, `name`, `specialty`, `phone`, `email`, `notes`

### Domain 14: Family Memories (`memories`)
- `memory_albums`: `id`, `family_id`, `title`, `description`, `cover_media_path`, `visibility` (`family`, `adults_only`)
- `memories`: `id`, `family_id`, `album_id (FK NULLABLE)`, `title`, `story_md`, `captured_on`, `media_paths_jsonb`, `tagged_member_ids`, `created_by_member_id`

### Domain 15: Habits & Routines (`habits`)
- `routines`: `id`, `family_id`, `title`, `schedule_type` (`morning`, `evening`, `custom`), `assigned_member_id`, `steps_jsonb`
- `habits`: `id`, `family_id`, `member_id (FK)`, `title`, `target_frequency` (`daily`, `weekly`), `current_streak`, `longest_streak`
- `habit_logs`: `id`, `family_id`, `habit_id (FK)`, `logged_on`, `completed_by_member_id`

### Domain 16: Family Safety (`safety`)
- `emergency_contacts`: `id`, `family_id`, `name`, `relationship`, `phone`, `priority_order`, `notes`
- `safety_checkins`: `id`, `family_id`, `member_id (FK)`, `status` (`safe`, `need_help`, `sos`), `message`, `lat`, `lng`, `created_at`
- `safety_medical_cards`: `id`, `family_id`, `member_id (FK)`, `conditions`, `medications`, `allergies`, `insurance_doc_id (FK NULLABLE)`

### Domain 17, 18, 19: Notifications, AI & Audit (`system`)
- `notifications`: `id`, `family_id (NULLABLE)`, `recipient_member_id`, `domain`, `title`, `body_redacted`, `deep_link`, `read_at`, `created_at`
- `push_subscriptions`: `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `device_label`, `created_at`
- `ai_conversations`: `id`, `family_id`, `member_id`, `title`, `created_at`
- `ai_messages`: `id`, `family_id`, `conversation_id (FK)`, `role` (`user`, `assistant`, `tool`), `content`, `created_at`
- `audit_logs`: `id`, `family_id`, `actor_member_id`, `action`, `resource_type`, `resource_id`, `metadata_jsonb`, `created_at`
