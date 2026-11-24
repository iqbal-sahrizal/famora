-- pgTAP Storage RLS Verification for Migration 0036 (BUG-016 & BUG-017)
-- Run in isolated local/staging Supabase environment via: supabase test db

BEGIN;
SELECT plan(8);

DO $$
DECLARE
  v_owner_a UUID := '11111111-1111-4111-8111-111111111111';
  v_adult_a UUID := '22222222-2222-4222-8222-222222222222';
  v_child_a UUID := '33333333-3333-4333-8333-333333333333';
  v_owner_b UUID := '44444444-4444-4444-8444-444444444444';
  v_fam_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_fam_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_role_owner UUID;
  v_role_adult UUID;
  v_role_child UUID;
BEGIN
  SELECT id INTO v_role_owner FROM public.family_roles WHERE role_key = 'owner' AND family_id IS NULL;
  SELECT id INTO v_role_adult FROM public.family_roles WHERE role_key = 'adult' AND family_id IS NULL;
  SELECT id INTO v_role_child FROM public.family_roles WHERE role_key = 'child' AND family_id IS NULL;

  INSERT INTO auth.users (id, email)
  VALUES
    (v_owner_a, 'owner_a@test.local'),
    (v_adult_a, 'adult_a@test.local'),
    (v_child_a, 'child_a@test.local'),
    (v_owner_b, 'owner_b@test.local')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name)
  VALUES
    (v_owner_a, 'Owner A'),
    (v_adult_a, 'Adult A'),
    (v_child_a, 'Child A'),
    (v_owner_b, 'Owner B')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.families (id, name, slug, created_by)
  VALUES
    (v_fam_a, 'Family A', 'family-a-0036', v_owner_a),
    (v_fam_b, 'Family B', 'family-b-0036', v_owner_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.family_members (family_id, user_id, role_id, display_name, status)
  VALUES
    (v_fam_a, v_owner_a, v_role_owner, 'Owner A', 'active'),
    (v_fam_a, v_adult_a, v_role_adult, 'Adult A', 'active'),
    (v_fam_a, v_child_a, v_role_child, 'Child A', 'active'),
    (v_fam_b, v_owner_b, v_role_owner, 'Owner B', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES
    ('family-documents', v_fam_a::text || '/standard/doc1.pdf', v_adult_a),
    ('family-documents', v_fam_a::text || '/vault/secret.pdf', v_owner_a),
    ('family-child-attachments', v_fam_a::text || '/child1/health.pdf', v_owner_a)
  ON CONFLICT DO NOTHING;
END $$;

-- 1. Anonymous user cannot read private storage objects
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id IN ('family-documents', 'family-child-attachments')),
  0,
  'anon cannot read family-documents or family-child-attachments'
);

-- 2. Adult in Family A can read standard document, NOT vault document
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'family-documents' AND name LIKE 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/standard/%'),
  1,
  'adult with documents.standard.manage can read standard/ object'
);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'family-documents' AND name LIKE 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vault/%'),
  0,
  'adult without documents.sensitive_vault cannot read vault/ object'
);

-- 3. Adult in Family A can delete standard document, cannot delete vault document
SELECT lives_ok(
  $$DELETE FROM storage.objects WHERE bucket_id = 'family-documents' AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/standard/doc1.pdf'$$,
  'adult can delete standard/ object'
);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'family-documents' AND name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vault/secret.pdf'),
  1,
  'vault/ object remains protected from adult'
);

-- 4. Owner in Family A can read vault/ object
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'family-documents' AND name LIKE 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/vault/%'),
  1,
  'owner with documents.sensitive_vault can read vault/ object'
);

-- 5. Cross-family Owner B cannot read Family A documents or child attachments
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id IN ('family-documents', 'family-child-attachments') AND name LIKE 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/%'),
  0,
  'Family B owner cannot read Family A storage objects'
);

-- 6. Child in Family A cannot read documents or child attachments without permission
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id IN ('family-documents', 'family-child-attachments') AND name LIKE 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/%'),
  0,
  'child without permissions cannot read storage objects'
);

ROLLBACK;
