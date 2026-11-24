-- Famora R6.4 — Production Security Preflight Queries (SELECT-ONLY)
-- Safe to run in Supabase Dashboard -> SQL Editor.
-- Zero DDL, zero DML, zero GRANT/REVOKE, zero mutations.

-- ============================================================================
-- 1. ALL famora.* FUNCTIONS — SIGNATURES, SECURITY DEFINER, SEARCH_PATH, OWNER
-- ============================================================================
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arg_signature,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS is_security_definer,
  p.proconfig AS proconfig_settings,
  pg_get_userbyid(p.proowner) AS owner_role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'famora'
ORDER BY p.proname, arg_signature;

-- ============================================================================
-- 2. ALL famora.* FUNCTIONS — EXECUTE PRIVILEGES (PUBLIC, anon, authenticated)
-- ============================================================================
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arg_signature,
  r.rolname AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (
  SELECT 0::oid AS oid, 'PUBLIC' AS rolname
  UNION ALL
  SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
) r
WHERE n.nspname = 'famora'
ORDER BY p.proname, r.rolname;

-- ============================================================================
-- 3. ALL famora.* FUNCTIONS — FULL DEFINITIONS (COMPARE AGAINST 0001-0035)
-- ============================================================================
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arg_signature,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'famora'
ORDER BY p.proname, arg_signature;

-- ============================================================================
-- 4. SECURITY DEFINER FUNCTIONS MISSING pg_temp IN search_path (ANOMALY CHECK)
-- ============================================================================
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arg_signature,
  p.proconfig AS proconfig_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'famora')
  AND p.prosecdef = true
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%pg_temp%'
    )
  )
ORDER BY n.nspname, p.proname;

-- ============================================================================
-- 5. DEPENDENCY READINESS CHECK FOR MIGRATIONS 0030-0037
-- ============================================================================
SELECT
  c.relname AS required_table,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'families',
    'family_members',
    'family_roles',
    'member_preferences',
    'notifications',
    'finance_accounts',
    'finance_transactions',
    'finance_debt_payments',
    'finance_goal_contributions',
    'bill_payment_history',
    'child_profiles',
    'family_announcements'
  )
ORDER BY c.relname;
