-- Famora R6 — Read-Only Production Catalog Inspection Queries
-- Safe to run in Supabase Dashboard -> SQL Editor (100% SELECT-only; zero mutations).
-- Run each section and save the JSON/CSV result for comparison against local migrations 0001-0037.

-- ============================================================================
-- 1. PUBLIC TABLES & RLS / FORCE RLS STATUS
-- ============================================================================
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ============================================================================
-- 2. COLUMNS & DATA TYPES (focus on 0030/0033/0034/0037 additions)
-- ============================================================================
SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- 3. PRIMARY KEYS, FOREIGN KEYS & CONSTRAINTS
-- ============================================================================
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(c.oid) AS definition
FROM information_schema.table_constraints tc
JOIN pg_namespace n ON n.nspname = tc.table_schema
JOIN pg_class tbl ON tbl.relname = tc.table_name AND tbl.relnamespace = n.oid
JOIN pg_constraint c ON c.conname = tc.constraint_name AND c.conrelid = tbl.oid
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ============================================================================
-- 4. INDEXES
-- ============================================================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================
SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- 6. FUNCTIONS (public & famora schemas, SECURITY DEFINER & search_path)
-- ============================================================================
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  p.proconfig AS config_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'famora')
ORDER BY n.nspname, p.proname;

-- ============================================================================
-- 7. RLS POLICIES (public schema + storage.objects)
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
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- ============================================================================
-- 8. GRANTS & PRIVILEGES (including column-level protection on user_devices)
-- ============================================================================
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

  SELECT
    table_name,
    column_name,
    grantee,
    privilege_type
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'user_devices'
  ORDER BY column_name, grantee, privilege_type;

-- ============================================================================
-- 9. STORAGE BUCKETS
-- ============================================================================
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
ORDER BY id;

-- ============================================================================
-- 10. EXTENSIONS & CUSTOM TYPES
-- ============================================================================
SELECT
  extname,
  extversion
FROM pg_extension
ORDER BY extname;

SELECT
  n.nspname AS schema_name,
  t.typname AS type_name,
  t.typtype
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname IN ('public', 'famora')
  AND t.typtype IN ('e', 'c', 'd')
ORDER BY n.nspname, t.typname;

-- ============================================================================
-- 11. SUPABASE MIGRATION HISTORY CHECK
-- ============================================================================
SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'supabase_migrations'
    AND table_name = 'schema_migrations'
) AS has_schema_migrations_table;
