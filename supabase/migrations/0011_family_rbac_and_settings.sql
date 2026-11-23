-- Migration 0011: Family Privacy Settings, Preferences, and Granular Permission Override RPCs

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB NOT NULL DEFAULT '{"allow_member_directory": true, "require_mfa_for_vault": true, "allow_guest_memories": true, "child_kiosk_enabled": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{"week_starts_on": "monday", "date_format": "MMM d, yyyy"}'::jsonb;

-- Return resolved granular permissions for the current authenticated user in a family
CREATE OR REPLACE FUNCTION famora.get_my_family_permissions(p_family_id UUID)
RETURNS TABLE (permission_key TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_family_id IS NULL OR auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.permission_key
  FROM public.permissions p
  WHERE famora.has_permission(p_family_id, p.permission_key) = true
  ORDER BY p.permission_key;
END;
$$;

REVOKE ALL ON FUNCTION famora.get_my_family_permissions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.get_my_family_permissions(UUID) TO authenticated;

-- Safely set or clear a per-member permission override (blocks self-modification and owner restriction)
CREATE OR REPLACE FUNCTION famora.set_member_permission_override(
  p_family_id UUID,
  p_target_member_id UUID,
  p_permission_key TEXT,
  p_effect TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_member_id UUID;
  v_permission_id UUID;
  v_target_role_key TEXT;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_target_member_id IS NULL THEN
    RAISE EXCEPTION 'Invalid permission override parameters' USING ERRCODE = '22023';
  END IF;

  IF p_effect NOT IN ('allow', 'deny', 'inherit') THEN
    RAISE EXCEPTION 'Invalid override effect: %', p_effect USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'family.members.invite_manage') THEN
    RAISE EXCEPTION 'Insufficient privileges to manage member permissions' USING ERRCODE = '42501';
  END IF;

  v_caller_member_id := famora.current_member_id(p_family_id);
  IF v_caller_member_id = p_target_member_id THEN
    RAISE EXCEPTION 'Users cannot modify their own permission overrides' USING ERRCODE = '42501';
  END IF;

  SELECT fr.role_key INTO v_target_role_key
  FROM public.family_members fm
  JOIN public.family_roles fr ON fr.id = fm.role_id
  WHERE fm.id = p_target_member_id AND fm.family_id = p_family_id;

  IF v_target_role_key IS NULL THEN
    RAISE EXCEPTION 'Target member not found in family' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_role_key = 'owner' THEN
    RAISE EXCEPTION 'Owner permissions cannot be restricted via overrides' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_permission_id
  FROM public.permissions
  WHERE permission_key = p_permission_key;

  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'Unknown permission key: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF p_effect = 'inherit' THEN
    DELETE FROM public.member_permission_overrides
    WHERE family_id = p_family_id
      AND member_id = p_target_member_id
      AND permission_id = v_permission_id;
  ELSE
    INSERT INTO public.member_permission_overrides (
      family_id, member_id, permission_id, effect, granted_by_member_id
    )
    VALUES (
      p_family_id, p_target_member_id, v_permission_id, p_effect, v_caller_member_id
    )
    ON CONFLICT (member_id, permission_id)
    DO UPDATE SET
      effect = EXCLUDED.effect,
      granted_by_member_id = EXCLUDED.granted_by_member_id,
      updated_at = now();
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.set_member_permission_override(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.set_member_permission_override(UUID, UUID, TEXT, TEXT) TO authenticated;
