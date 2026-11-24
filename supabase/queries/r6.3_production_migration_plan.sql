-- Famora R6.3 — Proposed Production Migration & Validation Plan
-- ============================================================================
-- STATUS: PROPOSED PLAN ONLY — NOT EXECUTED.
-- DO NOT RUN PART 3 AGAINST PRODUCTION WITHOUT:
--   1. Confirmed automated backup / PITR + fresh pg_dump snapshot.
--   2. Completed Preflight checks (Part 1) including famora.* function metadata.
--   3. Explicit user approval.
-- ============================================================================

-- ============================================================================
-- PART 1: PREFLIGHT READ-ONLY CHECKS (SELECT-ONLY — SAFE TO RUN)
-- ============================================================================

-- 1A. Verify all famora.* function security metadata (prosecdef, proconfig, owner)
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  p.proconfig AS config_settings,
  pg_get_userbyid(p.proowner) AS owner,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'famora'
ORDER BY p.proname;

-- 1B. Check all existing policies on public.notifications (confirm 0013 policies exist before 0031)
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications'
ORDER BY policyname;

-- 1C. Check existing storage.objects in family-documents to assess 0036 vault-tier impact
SELECT
  bucket_id,
  (storage.foldername(name))[2] AS tier_segment,
  count(*) AS object_count
FROM storage.objects
WHERE bucket_id = 'family-documents'
GROUP BY bucket_id, (storage.foldername(name))[2]
ORDER BY tier_segment;

-- 1D. Check existing row counts on tables altered by 0030, 0033, 0037 (no backfill loss check)
SELECT
  (SELECT count(*) FROM public.finance_accounts) AS finance_accounts_count,
  (SELECT count(*) FROM public.member_preferences) AS member_preferences_count,
  (SELECT count(*) FROM public.family_announcements) AS family_announcements_count;

-- ============================================================================
-- PART 2: BACKUP & RECOVERY PREREQUISITES (MANUAL CHECKLIST — NO SQL MUTATION)
-- ============================================================================
-- [ ] Confirm Supabase Automated Daily Backups / PITR enabled for eaxrhlgwsepdlfnveypo.
-- [ ] Take fresh logical backup before Part 3:
--     pg_dump "<PROD_RO_OR_ADMIN_URI>" --schema=public --schema=famora --format=custom -f famora_pre_r6_3.dump
-- [ ] Verify restore procedure on a disposable database before production execution.

-- ============================================================================
-- PART 3: PROPOSED MIGRATION OPERATIONS — NOT EXECUTED
-- Applies ONLY confirmed missing migrations in dependency order:
--   0030 -> 0031 -> 0033 -> 0034 -> 0035 (skipping buggy 0032) -> 0036 -> 0037
-- Zero DROP TABLE, zero CASCADE, zero destructive data updates.
-- ============================================================================

/*  <<< NOT EXECUTED — REMOVE COMMENT WRAPPER ONLY AFTER APPROVAL & BACKUP >>>

BEGIN;

-- --- [STEP 1] Migration 0030: Finance Account Archiving ---
ALTER TABLE public.finance_accounts
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_finance_accounts_family_archived
  ON public.finance_accounts(family_id, is_archived);

-- --- [STEP 2] Migration 0031: Notifications Recipient Delete Policy ---
DROP POLICY IF EXISTS "notifications_delete_recipient" ON public.notifications;
CREATE POLICY "notifications_delete_recipient" ON public.notifications
  FOR DELETE TO authenticated
  USING (recipient_member_id = famora.current_member_id(family_id));

-- --- [STEP 3] Migration 0033: Member Preferences Locale ---
-- Existing rows receive DEFAULT 'id' automatically via NOT NULL DEFAULT 'id'.
ALTER TABLE public.member_preferences
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'id'
  CHECK (locale IN ('id', 'en'));

-- --- [STEP 4] Migration 0034: Child Attachments Table & Private Bucket ---
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'family-child-attachments',
  'family-child-attachments',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.child_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_profile_id UUID NOT NULL REFERENCES public.child_profiles(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('health', 'education', 'milestone')),
  file_name TEXT NOT NULL CHECK (char_length(trim(file_name)) BETWEEN 1 AND 180),
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
  uploaded_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_child_attachments_child
  ON public.child_attachments(family_id, child_profile_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_child_attachments_updated_at ON public.child_attachments;
CREATE TRIGGER trg_child_attachments_updated_at
  BEFORE UPDATE ON public.child_attachments
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

ALTER TABLE public.child_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_attachments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.child_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_attachments TO authenticated;

DROP POLICY IF EXISTS "child_attachments_select_permitted" ON public.child_attachments;
CREATE POLICY "child_attachments_select_permitted" ON public.child_attachments
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN record_type = 'health' THEN famora.has_permission(family_id, 'child_dev.health.view')
      ELSE famora.has_permission(family_id, 'child_dev.identity.view')
    END
  );

DROP POLICY IF EXISTS "child_attachments_write_permitted" ON public.child_attachments;
CREATE POLICY "child_attachments_write_permitted" ON public.child_attachments
  FOR ALL TO authenticated
  USING (
    CASE
      WHEN record_type = 'health' THEN famora.has_permission(family_id, 'child_dev.health.view')
      ELSE famora.has_permission(family_id, 'child_dev.growth_milestones.manage')
    END
  )
  WITH CHECK (
    CASE
      WHEN record_type = 'health' THEN famora.has_permission(family_id, 'child_dev.health.view')
      ELSE famora.has_permission(family_id, 'child_dev.growth_milestones.manage')
    END
  );

-- --- [STEP 5] Migration 0035: Delete Family Workspace RPC (replaces/skips buggy 0032) ---
CREATE OR REPLACE FUNCTION famora.delete_family_workspace(
  p_family_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, famora, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_owner BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'family.delete') THEN
    RAISE EXCEPTION 'Only the family owner can delete a family workspace'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.family_members fm
    JOIN public.family_roles fr ON fr.id = fm.role_id
    WHERE fm.family_id = p_family_id
      AND fm.user_id = v_user_id
      AND fm.status = 'active'
      AND fr.role_key = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Active family owner membership required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.families WHERE id = p_family_id) THEN
    RAISE EXCEPTION 'Family workspace not found';
  END IF;

  DELETE FROM public.finance_debt_payments WHERE family_id = p_family_id;
  DELETE FROM public.finance_goal_contributions WHERE family_id = p_family_id;
  DELETE FROM public.bill_payment_history WHERE family_id = p_family_id;

  UPDATE public.finance_transactions
  SET reversed_transaction_id = NULL
  WHERE family_id = p_family_id
    AND reversed_transaction_id IS NOT NULL;

  DELETE FROM public.finance_transactions WHERE family_id = p_family_id;
  DELETE FROM public.finance_accounts WHERE family_id = p_family_id;
  DELETE FROM public.families WHERE id = p_family_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.delete_family_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.delete_family_workspace(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_family_workspace(
  p_family_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.delete_family_workspace(p_family_id);
$$;

REVOKE ALL ON FUNCTION public.delete_family_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_family_workspace(UUID) TO authenticated;

-- --- [STEP 6] Migration 0036: Hardened Storage RLS Policies ---
DROP POLICY IF EXISTS "family_docs_storage_select" ON storage.objects;
CREATE POLICY "family_docs_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'family-documents'
    AND CASE
      WHEN (storage.foldername(name))[2] = 'vault'
        THEN famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
      ELSE (
        famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
        OR famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
      )
    END
  );

DROP POLICY IF EXISTS "family_docs_storage_insert" ON storage.objects;
CREATE POLICY "family_docs_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'family-documents'
    AND CASE
      WHEN (storage.foldername(name))[2] = 'vault'
        THEN famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
      ELSE (
        famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
        OR famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
      )
    END
  );

DROP POLICY IF EXISTS "family_docs_storage_delete" ON storage.objects;
CREATE POLICY "family_docs_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'family-documents'
    AND CASE
      WHEN (storage.foldername(name))[2] = 'vault'
        THEN famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
      ELSE (
        famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
        OR famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
      )
    END
  );

DROP POLICY IF EXISTS "child_attachments_storage_select" ON storage.objects;
CREATE POLICY "child_attachments_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'family-child-attachments'
    AND (
      famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.identity.view')
      OR famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.health.view')
      OR famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.growth_milestones.manage')
    )
  );

DROP POLICY IF EXISTS "child_attachments_storage_insert" ON storage.objects;
CREATE POLICY "child_attachments_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'family-child-attachments'
    AND (
      famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.growth_milestones.manage')
      OR famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.health.view')
    )
  );

DROP POLICY IF EXISTS "child_attachments_storage_delete" ON storage.objects;
CREATE POLICY "child_attachments_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'family-child-attachments'
    AND (
      famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.growth_milestones.manage')
      OR famora.has_permission((storage.foldername(name))[1]::uuid, 'child_dev.health.view')
    )
  );

-- --- [STEP 7] Migration 0037: Task & Noticeboard Storage Buckets & Policies ---
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'family-tasks',
    'family-tasks',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'family-noticeboard',
    'family-noticeboard',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.family_announcements
  ADD COLUMN IF NOT EXISTS attachment_storage_path TEXT;

DROP POLICY IF EXISTS "family_tasks_storage_select" ON storage.objects;
CREATE POLICY "family_tasks_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'family-tasks'
    AND famora.is_family_member((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "family_tasks_storage_insert" ON storage.objects;
CREATE POLICY "family_tasks_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'family-tasks'
    AND famora.is_family_member((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "family_tasks_storage_delete" ON storage.objects;
CREATE POLICY "family_tasks_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'family-tasks'
    AND famora.is_family_member((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "family_noticeboard_storage_select" ON storage.objects;
CREATE POLICY "family_noticeboard_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'family-noticeboard'
    AND famora.is_family_member((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "family_noticeboard_storage_insert" ON storage.objects;
CREATE POLICY "family_noticeboard_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'family-noticeboard'
    AND famora.has_permission((storage.foldername(name))[1]::uuid, 'announcements.publish')
  );

DROP POLICY IF EXISTS "family_noticeboard_storage_delete" ON storage.objects;
CREATE POLICY "family_noticeboard_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'family-noticeboard'
    AND famora.has_permission((storage.foldername(name))[1]::uuid, 'announcements.publish')
  );

COMMIT;

>>> END NOT EXECUTED */

-- ============================================================================
-- PART 4: POST-MIGRATION VALIDATION QUERIES (SELECT-ONLY)
-- ============================================================================
SELECT count(*) AS public_table_count
FROM pg_tables
WHERE schemaname = 'public';

SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'finance_accounts' AND column_name IN ('is_archived', 'archived_at'))
    OR (table_name = 'member_preferences' AND column_name = 'locale')
    OR (table_name = 'family_announcements' AND column_name = 'attachment_storage_path')
  )
ORDER BY table_name, column_name;

SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('family-documents', 'family-child-attachments', 'family-tasks', 'family-noticeboard')
ORDER BY id;

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
