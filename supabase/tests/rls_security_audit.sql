-- Phase 1.2 Live PostgreSQL RLS & Authorization Verification Suite
-- Run inside an isolated transaction against a non-production test/staging Postgres DB.

BEGIN;

-- Verify RLS is enabled AND forced on all critical multi-tenant tables
DO $$
DECLARE
  v_unprotected TEXT[];
BEGIN
  SELECT array_agg(c.relname)
  INTO v_unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF array_length(v_unprotected, 1) > 0 THEN
    RAISE EXCEPTION 'Tables missing ENABLE + FORCE ROW LEVEL SECURITY: %', v_unprotected;
  END IF;
END $$;

-- Verify anon role has zero table privileges on sensitive public tables
DO $$
DECLARE
  v_anon_grants INTEGER;
BEGIN
  SELECT count(*)
  INTO v_anon_grants
  FROM information_schema.role_table_grants
  WHERE grantee IN ('anon', 'PUBLIC')
    AND table_schema = 'public'
    AND table_name IN ('families', 'family_members', 'finance_accounts', 'documents', 'child_health_records', 'chat_messages');

  IF v_anon_grants > 0 THEN
    RAISE EXCEPTION 'Unexpected anon/PUBLIC table grants detected (%)', v_anon_grants;
  END IF;
END $$;

-- Verify pin_hash is excluded from authenticated SELECT grants on family_members
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.column_privileges
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'family_members'
      AND column_name = 'pin_hash'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated role must NOT have SELECT privilege on family_members.pin_hash';
  END IF;
END $$;

ROLLBACK;
