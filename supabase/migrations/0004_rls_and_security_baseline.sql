-- Migration 0004: Row-Level Security (RLS) Baseline & Security Helpers
-- Zero unrestricted access: EVERY table has RLS enabled and forced.

-- Helper: Check if current auth.uid() is an active member of target family
CREATE OR REPLACE FUNCTION famora.is_family_member(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = p_family_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'active'
      AND (fm.access_expires_at IS NULL OR fm.access_expires_at > now())
  );
$$;

-- Helper: Return active member_id for current user in target family
CREATE OR REPLACE FUNCTION famora.current_member_id(p_family_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fm.id
  FROM public.family_members fm
  WHERE fm.family_id = p_family_id
    AND fm.user_id = auth.uid()
    AND fm.status = 'active'
    AND (fm.access_expires_at IS NULL OR fm.access_expires_at > now())
  LIMIT 1;
$$;

-- Helper: Check if current user holds a specific permission in target family
CREATE OR REPLACE FUNCTION famora.has_permission(p_family_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.family_members fm
    JOIN public.role_permissions rp ON rp.role_id = fm.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE fm.family_id = p_family_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'active'
      AND (fm.access_expires_at IS NULL OR fm.access_expires_at > now())
      AND p.permission_key = p_permission_key
  );
$$;

-- Enable & Force RLS on all 10 core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families FORCE ROW LEVEL SECURITY;

ALTER TABLE public.family_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.member_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_preferences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs FORCE ROW LEVEL SECURITY;

-- Policies: profiles
CREATE POLICY "profiles_select_self_or_shared_family" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm_target
      JOIN public.family_members fm_self ON fm_self.family_id = fm_target.family_id
      WHERE fm_target.user_id = profiles.id
        AND fm_self.user_id = auth.uid()
        AND fm_target.status = 'active'
        AND fm_self.status = 'active'
    )
  );

CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Policies: families
CREATE POLICY "families_select_member" ON public.families
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND famora.is_family_member(id));

CREATE POLICY "families_insert_authenticated" ON public.families
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "families_update_permitted" ON public.families
  FOR UPDATE TO authenticated
  USING (famora.has_permission(id, 'family.settings.manage'))
  WITH CHECK (famora.has_permission(id, 'family.settings.manage'));

CREATE POLICY "families_delete_owner" ON public.families
  FOR DELETE TO authenticated
  USING (famora.has_permission(id, 'family.delete'));

-- Policies: family_roles (authenticated users can read system roles + their family's custom roles)
CREATE POLICY "family_roles_select_scoped" ON public.family_roles
  FOR SELECT TO authenticated
  USING (is_system = true OR famora.is_family_member(family_id));

CREATE POLICY "family_roles_manage_custom" ON public.family_roles
  FOR ALL TO authenticated
  USING (family_id IS NOT NULL AND famora.has_permission(family_id, 'family.settings.manage'))
  WITH CHECK (family_id IS NOT NULL AND famora.has_permission(family_id, 'family.settings.manage'));

-- Policies: permissions & role_permissions (read-only catalog for authenticated users)
CREATE POLICY "permissions_select_authenticated" ON public.permissions
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "role_permissions_select_scoped" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_roles fr
      WHERE fr.id = role_permissions.role_id
        AND (fr.is_system = true OR famora.is_family_member(fr.family_id))
    )
  );

-- Policies: family_members
CREATE POLICY "family_members_select_same_family" ON public.family_members
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "family_members_insert_permitted" ON public.family_members
  FOR INSERT TO authenticated
  WITH CHECK (famora.has_permission(family_id, 'family.members.invite_manage'));

CREATE POLICY "family_members_update_permitted_or_self_display" ON public.family_members
  FOR UPDATE TO authenticated
  USING (
    famora.has_permission(family_id, 'family.members.invite_manage')
    OR user_id = auth.uid()
  )
  WITH CHECK (
    famora.has_permission(family_id, 'family.members.invite_manage')
    OR user_id = auth.uid()
  );

CREATE POLICY "family_members_delete_permitted" ON public.family_members
  FOR DELETE TO authenticated
  USING (famora.has_permission(family_id, 'family.members.invite_manage'));

-- Policies: family_invitations
CREATE POLICY "family_invitations_manage_permitted" ON public.family_invitations
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'family.members.invite_manage'))
  WITH CHECK (famora.has_permission(family_id, 'family.members.invite_manage'));

-- Policies: member_preferences
CREATE POLICY "member_preferences_select_self" ON public.member_preferences
  FOR SELECT TO authenticated
  USING (member_id = famora.current_member_id(family_id));

CREATE POLICY "member_preferences_upsert_self" ON public.member_preferences
  FOR ALL TO authenticated
  USING (member_id = famora.current_member_id(family_id))
  WITH CHECK (member_id = famora.current_member_id(family_id));

-- Policies: user_devices
CREATE POLICY "user_devices_own_only" ON public.user_devices
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policies: activity_logs (read-only for permitted members; append-only via triggers/server)
CREATE POLICY "activity_logs_select_permitted" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'audit_logs.view'));
