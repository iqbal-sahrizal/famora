-- Migration 0006: Explicit Table Privileges, Permission Overrides, and Hardened Security Functions

-- 1. Revoke all default/public/anon table privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- 2. Grant explicit, least-privilege table access to authenticated role (RLS still gates every row)
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
-- Protect sensitive pin_hash column on family_members from arbitrary SELECT
GRANT SELECT (id, family_id, user_id, role_id, display_name, is_managed_child, status, access_expires_at, joined_at, created_at, updated_at)
  ON public.family_members TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT SELECT ON public.activity_logs TO authenticated;

-- 3. Per-member permission overrides table
CREATE TABLE public.member_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  granted_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_member_permission_override UNIQUE (member_id, permission_id)
);

CREATE INDEX idx_member_perm_overrides_family ON public.member_permission_overrides(family_id);
CREATE INDEX idx_member_perm_overrides_member ON public.member_permission_overrides(member_id);

CREATE TRIGGER trg_member_permission_overrides_updated_at
  BEFORE UPDATE ON public.member_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

ALTER TABLE public.member_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_permission_overrides FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.member_permission_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_permission_overrides TO authenticated;

CREATE POLICY "member_overrides_select_family" ON public.member_permission_overrides
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      member_id = famora.current_member_id(family_id)
      OR famora.has_permission(family_id, 'family.members.invite_manage')
    )
  );

CREATE POLICY "member_overrides_manage_admin" ON public.member_permission_overrides
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'family.members.invite_manage'))
  WITH CHECK (famora.has_permission(family_id, 'family.members.invite_manage'));

-- 4. Hardened SECURITY DEFINER functions with controlled search_path and input validation
CREATE OR REPLACE FUNCTION famora.is_family_member(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_family_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.family_id = p_family_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'active'
      AND f.deleted_at IS NULL
      AND (fm.access_expires_at IS NULL OR fm.access_expires_at > now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION famora.current_member_id(p_family_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_id UUID;
BEGIN
  IF p_family_id IS NULL OR auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT fm.id INTO v_member_id
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id
  WHERE fm.family_id = p_family_id
    AND fm.user_id = auth.uid()
    AND fm.status = 'active'
    AND f.deleted_at IS NULL
    AND (fm.access_expires_at IS NULL OR fm.access_expires_at > now())
  LIMIT 1;

  RETURN v_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION famora.member_role_key(p_family_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_key TEXT;
BEGIN
  IF p_family_id IS NULL OR auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT fr.role_key INTO v_role_key
  FROM public.family_members fm
  JOIN public.family_roles fr ON fr.id = fm.role_id
  JOIN public.families f ON f.id = fm.family_id
  WHERE fm.family_id = p_family_id
    AND fm.user_id = auth.uid()
    AND fm.status = 'active'
    AND f.deleted_at IS NULL
    AND (fm.access_expires_at IS NULL OR fm.access_expires_at > now())
  LIMIT 1;

  RETURN v_role_key;
END;
$$;

CREATE OR REPLACE FUNCTION famora.has_role(p_family_id UUID, p_allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_family_id IS NULL OR p_allowed_roles IS NULL OR array_length(p_allowed_roles, 1) IS NULL THEN
    RETURN false;
  END IF;

  v_role := famora.member_role_key(p_family_id);
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_role = ANY(p_allowed_roles);
END;
$$;

CREATE OR REPLACE FUNCTION famora.has_permission(p_family_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_id UUID;
  v_role_id UUID;
  v_is_managed_child BOOLEAN;
  v_override TEXT;
BEGIN
  IF p_family_id IS NULL OR p_permission_key IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT fm.id, fm.role_id, fm.is_managed_child
  INTO v_member_id, v_role_id, v_is_managed_child
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id
  WHERE fm.family_id = p_family_id
    AND fm.user_id = auth.uid()
    AND fm.status = 'active'
    AND f.deleted_at IS NULL
    AND (fm.access_expires_at IS NULL OR fm.access_expires_at > now())
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check per-member override (explicit deny always wins)
  SELECT mpo.effect INTO v_override
  FROM public.member_permission_overrides mpo
  JOIN public.permissions p ON p.id = mpo.permission_id
  WHERE mpo.member_id = v_member_id
    AND mpo.family_id = p_family_id
    AND p.permission_key = p_permission_key
    AND (mpo.expires_at IS NULL OR mpo.expires_at > now())
  LIMIT 1;

  IF v_override = 'deny' THEN
    RETURN false;
  ELSIF v_override = 'allow' AND v_is_managed_child = false THEN
    RETURN true;
  END IF;

  -- Fallback to role_permissions
  RETURN EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_role_id
      AND p.permission_key = p_permission_key
  );
END;
$$;

-- Restrict execute privileges on internal famora functions
REVOKE ALL ON SCHEMA famora FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA famora TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA famora FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.is_family_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION famora.current_member_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION famora.member_role_key(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION famora.has_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION famora.has_permission(UUID, TEXT) TO authenticated;
