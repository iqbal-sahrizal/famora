-- Migration 0009: Family Onboarding Columns, Atomic Family Creation RPC, and Invitations RPC

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Atomic family creation + owner membership + default preferences + audit log
CREATE OR REPLACE FUNCTION famora.create_family_with_owner(
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_timezone TEXT DEFAULT 'UTC',
  p_currency_code TEXT DEFAULT 'USD',
  p_avatar_path TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_owner_role_id UUID;
  v_base_slug TEXT;
  v_slug TEXT;
  v_family_id UUID;
  v_member_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) < 2 OR char_length(trim(p_name)) > 100 THEN
    RAISE EXCEPTION 'Family name must be between 2 and 100 characters' USING ERRCODE = '22023';
  END IF;

  IF p_currency_code IS NULL OR p_currency_code !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Invalid ISO-4217 currency code' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_owner_role_id
  FROM public.family_roles
  WHERE role_key = 'owner' AND family_id IS NULL
  LIMIT 1;

  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'System owner role not configured' USING ERRCODE = 'P0002';
  END IF;

  SELECT full_name INTO v_user_name FROM public.profiles WHERE id = v_user_id;
  IF v_user_name IS NULL THEN
    v_user_name := 'Family Owner';
  END IF;

  v_base_slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_base_slug := trim(both '-' FROM v_base_slug);
  IF char_length(v_base_slug) < 2 THEN
    v_base_slug := 'family';
  END IF;
  v_slug := left(v_base_slug, 68) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  INSERT INTO public.families (name, slug, description, timezone, currency_code, avatar_path, created_by)
  VALUES (
    trim(p_name),
    v_slug,
    left(coalesce(trim(p_description), ''), 500),
    coalesce(nullif(trim(p_timezone), ''), 'UTC'),
    p_currency_code,
    p_avatar_path,
    v_user_id
  )
  RETURNING id INTO v_family_id;

  INSERT INTO public.family_members (family_id, user_id, role_id, display_name, is_managed_child, status)
  VALUES (v_family_id, v_user_id, v_owner_role_id, left(v_user_name, 80), false, 'active')
  ON CONFLICT (family_id, user_id) WHERE user_id IS NOT NULL AND status <> 'removed'
  DO NOTHING
  RETURNING id INTO v_member_id;

  IF v_member_id IS NOT NULL THEN
    INSERT INTO public.member_preferences (family_id, member_id)
    VALUES (v_family_id, v_member_id)
    ON CONFLICT (member_id) DO NOTHING;

    INSERT INTO public.activity_logs (family_id, actor_member_id, action, resource_type, resource_id, metadata)
    VALUES (v_family_id, v_member_id, 'family.created', 'families', v_family_id, jsonb_build_object('slug', v_slug));
  END IF;

  RETURN v_family_id;
END;
$$;

REVOKE ALL ON FUNCTION famora.create_family_with_owner(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.create_family_with_owner(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
