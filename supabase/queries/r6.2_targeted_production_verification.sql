-- Famora R6.2 — Targeted Production Schema Verification Queries
-- STRICTLY READ-ONLY: Contains ONLY SELECT statements against catalog/information_schema tables.
-- Safe to run in Supabase Dashboard -> SQL Editor (zero mutations, zero DDL, zero DCL).

-- ============================================================================
-- 1. MIGRATION 0030 — finance_accounts archive columns & index
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'finance_accounts'
  AND column_name IN ('is_archived', 'archived_at')
ORDER BY column_name;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'finance_accounts'
  AND indexname = 'idx_finance_accounts_family_archived';

-- ============================================================================
-- 2. MIGRATION 0031 — notifications_delete_recipient policy & table privileges
-- ============================================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'notifications'
ORDER BY policyname;

SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'notifications'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- ============================================================================
-- 3. MIGRATIONS 0032 & 0035 — delete_family_workspace (public & famora)
-- ============================================================================
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  p.proconfig AS config_settings,
  pg_get_userbyid(p.proowner) AS owner,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'delete_family_workspace'
  AND n.nspname IN ('public', 'famora')
ORDER BY n.nspname;

SELECT
  routine_schema,
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'delete_family_workspace'
  AND routine_schema IN ('public', 'famora')
ORDER BY routine_schema, grantee, privilege_type;

-- ============================================================================
-- 4. MIGRATION 0033 — member_preferences.locale column & check constraint
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'member_preferences'
  AND column_name = 'locale';

SELECT
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'member_preferences'
  AND c.contype = 'c';

-- ============================================================================
-- 5. MIGRATION 0034 — public.child_attachments & family-child-attachments bucket
-- ============================================================================
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'child_attachments';

SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE id = 'family-child-attachments';

-- ============================================================================
-- 6. MIGRATION 0036 — Storage RLS policies for family-documents & family-child-attachments
-- ============================================================================
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    policyname LIKE 'family_docs_storage_%'
    OR policyname LIKE 'child_attachments_storage_%'
    OR qual LIKE '%family-documents%'
    OR qual LIKE '%family-child-attachments%'
    OR with_check LIKE '%family-documents%'
    OR with_check LIKE '%family-child-attachments%'
  )
ORDER BY policyname;

-- ============================================================================
-- 7. MIGRATION 0037 — family-tasks & family-noticeboard buckets, column, & policies
-- ============================================================================
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE id IN ('family-tasks', 'family-noticeboard')
ORDER BY id;

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'family_announcements'
  AND column_name = 'attachment_storage_path';

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    policyname LIKE 'family_tasks_storage_%'
    OR policyname LIKE 'family_noticeboard_storage_%'
    OR qual LIKE '%family-tasks%'
    OR qual LIKE '%family-noticeboard%'
    OR with_check LIKE '%family-tasks%'
    OR with_check LIKE '%family-noticeboard%'
  )
ORDER BY policyname;

-- ============================================================================
-- 8. ALL famora.* FUNCTIONS — signatures, security, definitions, & privileges
-- ============================================================================
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  p.proconfig AS config_settings,
  pg_get_userbyid(p.proowner) AS owner,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'famora'
ORDER BY p.proname;

SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'famora'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY routine_name, grantee, privilege_type;
