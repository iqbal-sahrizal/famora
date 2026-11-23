-- Development Seed Data for Famora (Local / Staging Only)
-- Demonstrates multi-family membership where users hold independent roles per family.

DO $$
DECLARE
  v_user_maya UUID := '11111111-1111-4111-8111-111111111111';
  v_user_daniel UUID := '22222222-2222-4222-8222-222222222222';
  v_family_rivera UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_family_grandparents UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_role_owner UUID;
  v_role_admin UUID;
  v_role_extended UUID;
  v_role_child UUID;
  v_member_maya_rivera UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
BEGIN
  -- 1. Seed auth.users stubs only if running in local dev where users don't exist yet
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role)
  VALUES
    (v_user_maya, 'maya@famora.local', crypt('DevPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Maya Rivera"}', now(), now(), 'authenticated', 'authenticated'),
    (v_user_daniel, 'daniel@famora.local', crypt('DevPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Daniel Rivera"}', now(), now(), 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Profiles (no global family role stored here)
  INSERT INTO public.profiles (id, full_name, default_timezone, locale)
  VALUES
    (v_user_maya, 'Maya Rivera', 'America/Los_Angeles', 'en-US'),
    (v_user_daniel, 'Daniel Rivera', 'America/Los_Angeles', 'en-US')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Families
  INSERT INTO public.families (id, name, slug, timezone, currency_code, created_by)
  VALUES
    (v_family_rivera, 'The Rivera Family', 'rivera-family', 'America/Los_Angeles', 'USD', v_user_maya),
    (v_family_grandparents, 'Grandparents Household', 'grandparents-household', 'America/New_York', 'USD', v_user_daniel)
  ON CONFLICT (id) DO NOTHING;

  -- Resolve system role IDs
  SELECT id INTO v_role_owner FROM public.family_roles WHERE role_key = 'owner' AND family_id IS NULL;
  SELECT id INTO v_role_admin FROM public.family_roles WHERE role_key = 'admin' AND family_id IS NULL;
  SELECT id INTO v_role_extended FROM public.family_roles WHERE role_key = 'extended' AND family_id IS NULL;
  SELECT id INTO v_role_child FROM public.family_roles WHERE role_key = 'child' AND family_id IS NULL;

  -- 4. Independent per-family memberships
  -- Maya is Owner of Rivera Family, and Extended in Grandparents Household
  INSERT INTO public.family_members (id, family_id, user_id, role_id, display_name, is_managed_child, status)
  VALUES
    (v_member_maya_rivera, v_family_rivera, v_user_maya, v_role_owner, 'Maya', false, 'active'),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', v_family_grandparents, v_user_maya, v_role_extended, 'Maya (Guest)', false, 'active'),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', v_family_rivera, v_user_daniel, v_role_admin, 'Daniel', false, 'active'),
    ('ffffffff-ffff-4fff-8fff-ffffffffffff', v_family_grandparents, v_user_daniel, v_role_owner, 'Daniel', false, 'active'),
    -- Managed child without auth.users account
    ('99999999-9999-4999-8999-999999999999', v_family_rivera, NULL, v_role_child, 'Leo', true, 'active')
  ON CONFLICT DO NOTHING;

  -- 5. Member preferences
  INSERT INTO public.member_preferences (family_id, member_id, theme_mode, digest_enabled)
  VALUES (v_family_rivera, v_member_maya_rivera, 'light', true)
  ON CONFLICT (member_id) DO NOTHING;

  -- 6. User device
  INSERT INTO public.user_devices (user_id, device_label, device_fingerprint, platform)
  VALUES (v_user_maya, 'Maya iPhone PWA', 'dev-iphone-fp-0001', 'ios_pwa')
  ON CONFLICT (user_id, device_fingerprint) DO NOTHING;

  -- 7. Activity log
  INSERT INTO public.activity_logs (family_id, actor_member_id, action, resource_type, resource_id, metadata)
  VALUES (v_family_rivera, v_member_maya_rivera, 'family.created', 'families', v_family_rivera, '{"seed": true}'::jsonb);
END $$;
