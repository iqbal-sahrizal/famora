-- pgTAP Migration & RLS Isolation Test Suite
-- Run via: supabase test db

BEGIN;
SELECT plan(14);

-- 1. Verify all 10 core tables exist
SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT has_table('public', 'families', 'families table exists');
SELECT has_table('public', 'family_members', 'family_members table exists');
SELECT has_table('public', 'family_invitations', 'family_invitations table exists');
SELECT has_table('public', 'family_roles', 'family_roles table exists');
SELECT has_table('public', 'permissions', 'permissions table exists');
SELECT has_table('public', 'role_permissions', 'role_permissions table exists');
SELECT has_table('public', 'member_preferences', 'member_preferences table exists');
SELECT has_table('public', 'user_devices', 'user_devices table exists');
SELECT has_table('public', 'activity_logs', 'activity_logs table exists');

-- 2. Verify RLS is enabled and forced on core tenant tables
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.families'::regclass),
  'families has RLS enabled and forced'
);
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.family_members'::regclass),
  'family_members has RLS enabled and forced'
);
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.activity_logs'::regclass),
  'activity_logs has RLS enabled and forced'
);

-- 3. Verify system roles seeded
SELECT ok(
  (SELECT count(*) = 7 FROM public.family_roles WHERE is_system = true),
  '7 system roles are seeded'
);

SELECT * FROM finish();
ROLLBACK;
