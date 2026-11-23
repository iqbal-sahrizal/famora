-- pgTAP Security, Cross-Family Isolation, and Anti-Escalation Test Suite
-- Run via: supabase test db

BEGIN;
SELECT plan(10);

-- Setup two isolated families and users in local transaction
DO $$
DECLARE
  v_user_a UUID := '11111111-1111-4111-8111-111111111111';
  v_user_b UUID := '22222222-2222-4222-8222-222222222222';
  v_user_child UUID := '33333333-3333-4333-8333-333333333333';
  v_fam_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_fam_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_role_owner UUID;
  v_role_child UUID;
BEGIN
  SELECT id INTO v_role_owner FROM public.family_roles WHERE role_key = 'owner' AND family_id IS NULL;
  SELECT id INTO v_role_child FROM public.family_roles WHERE role_key = 'child' AND family_id IS NULL;

  INSERT INTO auth.users (id, email) VALUES (v_user_a, 'a@test.local'), (v_user_b, 'b@test.local'), (v_user_child, 'child@test.local') ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, full_name) VALUES (v_user_a, 'Owner A'), (v_user_b, 'Owner B'), (v_user_child, 'Child A') ON CONFLICT DO NOTHING;
  INSERT INTO public.families (id, name, slug, created_by) VALUES (v_fam_a, 'Family A', 'family-a', v_user_a), (v_fam_b, 'Family B', 'family-b', v_user_b) ON CONFLICT DO NOTHING;
  INSERT INTO public.family_members (family_id, user_id, role_id, display_name, status)
  VALUES
    (v_fam_a, v_user_a, v_role_owner, 'Owner A', 'active'),
    (v_fam_a, v_user_child, v_role_child, 'Child A', 'active'),
    (v_fam_b, v_user_b, v_role_owner, 'Owner B', 'active')
  ON CONFLICT DO NOTHING;
END $$;

-- 1. Unauthenticated (anon) cannot read families
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.families),
  0,
  'Unauthenticated anon user sees 0 families'
);

-- 2. Family A member cannot read Family B
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"a@test.local"}', true);
SELECT is(
  (SELECT count(*)::int FROM public.families WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'Family A member cannot access Family B'
);

-- 3. Family A member cannot read Family B members
SELECT is(
  (SELECT count(*)::int FROM public.family_members WHERE family_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'Family A member cannot read Family B members'
);

-- 4. Child account in Family A lacks finance.accounts.manage
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"child@test.local"}', true);
SELECT is(
  famora.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'finance.accounts.manage'),
  false,
  'Child account cannot access finance.accounts.manage'
);

-- 5. Child account lacks audit_logs.view
SELECT is(
  famora.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'audit_logs.view'),
  false,
  'Child account cannot view audit logs'
);

-- 6. Child account cannot escalate own role_id
SELECT throws_ok(
  $$
    UPDATE public.family_members
    SET role_id = (SELECT id FROM public.family_roles WHERE role_key = 'owner' AND family_id IS NULL)
    WHERE user_id = '33333333-3333-4333-8333-333333333333'
  $$,
  '42501',
  NULL,
  'Child account cannot escalate own role_id'
);

-- 7. Child account CAN update own display_name
SELECT lives_ok(
  $$
    UPDATE public.family_members
    SET display_name = 'Child A Updated'
    WHERE user_id = '33333333-3333-4333-8333-333333333333'
  $$,
  'Child account can update own display_name'
);

-- 8. pin_hash column is not selectable by authenticated
SELECT throws_ok(
  $$ SELECT pin_hash FROM public.family_members LIMIT 1 $$,
  '42501',
  NULL,
  'pin_hash column is protected from authenticated SELECT'
);

-- 9. Owner A has family.delete permission in Family A
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"a@test.local"}', true);
SELECT is(
  famora.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'family.delete'),
  true,
  'Owner A has family.delete in Family A'
);

-- 10. Owner A has NO permissions in Family B
SELECT is(
  famora.has_permission('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'family.members.view'),
  false,
  'Owner A has zero permissions in Family B'
);

SELECT * FROM finish();
ROLLBACK;
