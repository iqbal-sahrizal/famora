-- ==========================================
-- 0001_extensions_and_helpers.sql
-- ==========================================
-- Migration 0001: Extensions, internal schema, and shared trigger helpers
-- Safe, additive-only migration.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Dedicated internal schema for security/RLS helpers (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS famora;

-- Shared updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION famora.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ==========================================
-- 0002_core_identity_and_families.sql
-- ==========================================
-- Migration 0002: Core Identity, Families, Roles, and Permissions

-- 1. profiles (1:1 with auth.users; never stores global family roles)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 1 AND 120),
  avatar_path TEXT,
  default_timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT NOT NULL DEFAULT 'en-US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. families (Multi-family tenant root)
CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 80),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  currency_code CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency_code ~ '^[A-Z]{3}$'),
  avatar_path TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_families_created_by ON public.families(created_by);
CREATE INDEX idx_families_active ON public.families(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_families_updated_at
  BEFORE UPDATE ON public.families
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. family_roles (System default roles when family_id IS NULL, or family-scoped custom roles)
CREATE TABLE public.family_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL CHECK (role_key ~ '^[a-z0-9_]+$' AND char_length(role_key) BETWEEN 2 AND 40),
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 2 AND 60),
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT false,
  rank_order INTEGER NOT NULL DEFAULT 100 CHECK (rank_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_family_roles_system_key UNIQUE NULLS NOT DISTINCT (family_id, role_key),
  CONSTRAINT chk_family_roles_system_flag CHECK (
    (is_system = true AND family_id IS NULL) OR (is_system = false AND family_id IS NOT NULL)
  )
);

CREATE INDEX idx_family_roles_family_id ON public.family_roles(family_id);

CREATE TRIGGER trg_family_roles_updated_at
  BEFORE UPDATE ON public.family_roles
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. permissions (Canonical permission catalog)
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT NOT NULL UNIQUE CHECK (permission_key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  domain TEXT NOT NULL CHECK (char_length(trim(domain)) BETWEEN 2 AND 40),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_permissions_domain ON public.permissions(domain);

CREATE TRIGGER trg_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. role_permissions (Many-to-many mapping between family_roles and permissions)
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.family_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_role_permissions_pair UNIQUE (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role_id ON public.role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions(permission_id);

CREATE TRIGGER trg_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();


-- ==========================================
-- 0003_membership_and_invitations.sql
-- ==========================================
-- Migration 0003: Multi-Family Membership, Invitations, Preferences, Devices, and Activity Logs

-- 6. family_members (Independent per-family membership & role assignment)
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  role_id UUID NOT NULL REFERENCES public.family_roles(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),
  is_managed_child BOOLEAN NOT NULL DEFAULT false,
  pin_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'removed')),
  access_expires_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Managed child profiles may exist without an auth/profile user_id; standard members require user_id
  CONSTRAINT chk_member_identity CHECK (
    (is_managed_child = true) OR (user_id IS NOT NULL)
  )
);

-- A user can have at most one non-removed membership per family
CREATE UNIQUE INDEX uq_family_members_active_user
  ON public.family_members(family_id, user_id)
  WHERE user_id IS NOT NULL AND status <> 'removed';

CREATE INDEX idx_family_members_user_id ON public.family_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_family_members_family_status ON public.family_members(family_id, status);

CREATE TRIGGER trg_family_members_updated_at
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Ensure role_id belongs either to a system role (family_id IS NULL) or the exact same family_id
CREATE OR REPLACE FUNCTION famora.validate_member_role_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_family_id UUID;
BEGIN
  SELECT family_id INTO v_role_family_id
  FROM public.family_roles
  WHERE id = NEW.role_id;

  IF v_role_family_id IS NOT NULL AND v_role_family_id <> NEW.family_id THEN
    RAISE EXCEPTION 'Role % does not belong to family %', NEW.role_id, NEW.family_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_family_members_role_scope
  BEFORE INSERT OR UPDATE OF role_id, family_id ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION famora.validate_member_role_scope();

-- 7. family_invitations (Expiring token-hashed invitations)
CREATE TABLE public.family_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (position('@' IN email) > 1),
  role_id UUID NOT NULL REFERENCES public.family_roles(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) >= 32),
  invited_by_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_invitation_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_family_invitations_family_status ON public.family_invitations(family_id, status);
CREATE INDEX idx_family_invitations_email ON public.family_invitations(lower(email));

CREATE TRIGGER trg_family_invitations_updated_at
  BEFORE UPDATE ON public.family_invitations
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 8. member_preferences (Per-family, per-member notification & UI preferences)
CREATE TABLE public.member_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light', 'dark', 'system')),
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  digest_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_channels JSONB NOT NULL DEFAULT '{"push": true, "email": true, "in_app": true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_member_preferences_member UNIQUE (member_id)
);

CREATE INDEX idx_member_preferences_family ON public.member_preferences(family_id);

CREATE TRIGGER trg_member_preferences_updated_at
  BEFORE UPDATE ON public.member_preferences
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 9. user_devices (Registered PWA devices & Web Push endpoints)
CREATE TABLE public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_label TEXT NOT NULL CHECK (char_length(trim(device_label)) BETWEEN 1 AND 80),
  device_fingerprint TEXT NOT NULL CHECK (char_length(device_fingerprint) >= 8),
  platform TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'ios_pwa', 'android_pwa', 'desktop_pwa')),
  push_endpoint TEXT,
  push_p256dh TEXT,
  push_auth TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_devices_fingerprint UNIQUE (user_id, device_fingerprint)
);

CREATE INDEX idx_user_devices_user_active ON public.user_devices(user_id) WHERE revoked_at IS NULL;

CREATE TRIGGER trg_user_devices_updated_at
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 10. activity_logs (Immutable family-scoped audit & activity trail)
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (char_length(trim(action)) BETWEEN 2 AND 80),
  resource_type TEXT NOT NULL CHECK (char_length(trim(resource_type)) BETWEEN 2 AND 60),
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_family_created ON public.activity_logs(family_id, created_at DESC);
CREATE INDEX idx_activity_logs_actor ON public.activity_logs(actor_member_id);

CREATE TRIGGER trg_activity_logs_updated_at
  BEFORE UPDATE ON public.activity_logs
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();


-- ==========================================
-- 0004_rls_and_security_baseline.sql
-- ==========================================
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


-- ==========================================
-- 0005_seed_roles_and_permissions.sql
-- ==========================================
-- Migration 0005: Seed System Roles and Canonical Permission Catalog

INSERT INTO public.family_roles (family_id, role_key, display_name, description, is_system, rank_order)
VALUES
  (NULL, 'owner', 'Owner', 'Primary family custodian with full control including deletion.', true, 10),
  (NULL, 'admin', 'Admin', 'Co-manager with full operational control.', true, 20),
  (NULL, 'adult', 'Adult', 'Trusted household adult with daily management access.', true, 30),
  (NULL, 'teen', 'Teen', 'Age-appropriate autonomy for tasks, chat, and personal schedule.', true, 40),
  (NULL, 'child', 'Child', 'Simplified view for chores, habits, and rewards.', true, 50),
  (NULL, 'extended', 'Extended Family', 'Read-focused access to memories, calendar, and chat.', true, 60),
  (NULL, 'caregiver', 'Caregiver', 'Scoped access to child routines, safety cards, and assigned tasks.', true, 70)
ON CONFLICT (family_id, role_key) DO NOTHING;

INSERT INTO public.permissions (permission_key, domain, description)
VALUES
  ('family.delete', 'family', 'Delete or archive the entire family workspace'),
  ('family.settings.manage', 'family', 'Manage family profile, timezone, and custom roles'),
  ('family.members.invite_manage', 'family', 'Invite, update roles, or remove family members'),
  ('family.members.view', 'family', 'View active family member directory'),
  ('calendar.family.manage', 'calendar', 'Create and update shared family calendar events'),
  ('calendar.adults_only.view', 'calendar', 'View adults-only calendar events'),
  ('tasks.manage_all', 'tasks', 'Create and manage tasks across the family'),
  ('tasks.approve_chores', 'tasks', 'Approve completed chores and award points'),
  ('finance.accounts.manage', 'finance', 'Manage family financial accounts and budgets'),
  ('finance.transactions.manage', 'finance', 'Log and categorize family financial transactions'),
  ('finance.allowance.view_own', 'finance', 'View own allowance balance and history'),
  ('child_dev.manage', 'child-dev', 'Manage child profiles, milestones, and rewards'),
  ('child_dev.rewards.redeem', 'child-dev', 'Redeem earned reward points'),
  ('shopping.manage', 'shopping', 'Add, check off, and manage shopping list items'),
  ('inventory.manage', 'inventory', 'Manage household pantry and supply inventory'),
  ('documents.standard.manage', 'documents', 'Upload and manage standard family documents'),
  ('documents.sensitive_vault', 'documents', 'Access encrypted sensitive vault documents'),
  ('chat.family.participate', 'chat', 'Read and send messages in general family chat'),
  ('chat.adults_only.participate', 'chat', 'Participate in adults-only chat channels'),
  ('meals.manage', 'meals', 'Create recipes and weekly meal plans'),
  ('home.manage', 'home', 'Manage home assets, maintenance, and contractors'),
  ('memories.manage', 'memories', 'Upload and organize family memories and albums'),
  ('habits.manage_all', 'habits', 'Manage routines and habit trackers'),
  ('safety.contacts_medical.manage', 'safety', 'Manage emergency contacts and medical cards'),
  ('safety.sos.trigger', 'safety', 'Trigger emergency SOS alerts and safety check-ins'),
  ('ai.assistant.use', 'ai', 'Use the permission-scoped AI assistant'),
  ('audit_logs.view', 'settings', 'View family audit and activity logs')
ON CONFLICT (permission_key) DO NOTHING;

-- Map permissions to roles
WITH role_perm_map(r_key, p_key) AS (
  VALUES
    -- Owner gets all permissions
    ('owner', 'family.delete'), ('owner', 'family.settings.manage'), ('owner', 'family.members.invite_manage'), ('owner', 'family.members.view'),
    ('owner', 'calendar.family.manage'), ('owner', 'calendar.adults_only.view'), ('owner', 'tasks.manage_all'), ('owner', 'tasks.approve_chores'),
    ('owner', 'finance.accounts.manage'), ('owner', 'finance.transactions.manage'), ('owner', 'finance.allowance.view_own'),
    ('owner', 'child_dev.manage'), ('owner', 'child_dev.rewards.redeem'), ('owner', 'shopping.manage'), ('owner', 'inventory.manage'),
    ('owner', 'documents.standard.manage'), ('owner', 'documents.sensitive_vault'), ('owner', 'chat.family.participate'), ('owner', 'chat.adults_only.participate'),
    ('owner', 'meals.manage'), ('owner', 'home.manage'), ('owner', 'memories.manage'), ('owner', 'habits.manage_all'),
    ('owner', 'safety.contacts_medical.manage'), ('owner', 'safety.sos.trigger'), ('owner', 'ai.assistant.use'), ('owner', 'audit_logs.view'),

    -- Admin gets all except family.delete
    ('admin', 'family.settings.manage'), ('admin', 'family.members.invite_manage'), ('admin', 'family.members.view'),
    ('admin', 'calendar.family.manage'), ('admin', 'calendar.adults_only.view'), ('admin', 'tasks.manage_all'), ('admin', 'tasks.approve_chores'),
    ('admin', 'finance.accounts.manage'), ('admin', 'finance.transactions.manage'), ('admin', 'finance.allowance.view_own'),
    ('admin', 'child_dev.manage'), ('admin', 'child_dev.rewards.redeem'), ('admin', 'shopping.manage'), ('admin', 'inventory.manage'),
    ('admin', 'documents.standard.manage'), ('admin', 'documents.sensitive_vault'), ('admin', 'chat.family.participate'), ('admin', 'chat.adults_only.participate'),
    ('admin', 'meals.manage'), ('admin', 'home.manage'), ('admin', 'memories.manage'), ('admin', 'habits.manage_all'),
    ('admin', 'safety.contacts_medical.manage'), ('admin', 'safety.sos.trigger'), ('admin', 'ai.assistant.use'), ('admin', 'audit_logs.view'),

    -- Adult
    ('adult', 'family.members.view'), ('adult', 'calendar.family.manage'), ('adult', 'calendar.adults_only.view'),
    ('adult', 'tasks.manage_all'), ('adult', 'tasks.approve_chores'), ('adult', 'finance.transactions.manage'), ('adult', 'finance.allowance.view_own'),
    ('adult', 'child_dev.manage'), ('adult', 'shopping.manage'), ('adult', 'inventory.manage'), ('adult', 'documents.standard.manage'),
    ('adult', 'chat.family.participate'), ('adult', 'chat.adults_only.participate'), ('adult', 'meals.manage'), ('adult', 'home.manage'),
    ('adult', 'memories.manage'), ('adult', 'safety.contacts_medical.manage'), ('adult', 'safety.sos.trigger'), ('adult', 'ai.assistant.use'),

    -- Teen
    ('teen', 'family.members.view'), ('teen', 'calendar.family.manage'), ('teen', 'finance.allowance.view_own'),
    ('teen', 'child_dev.rewards.redeem'), ('teen', 'shopping.manage'), ('teen', 'chat.family.participate'),
    ('teen', 'meals.manage'), ('teen', 'memories.manage'), ('teen', 'safety.sos.trigger'), ('teen', 'ai.assistant.use'),

    -- Child
    ('child', 'family.members.view'), ('child', 'finance.allowance.view_own'), ('child', 'child_dev.rewards.redeem'),
    ('child', 'chat.family.participate'), ('child', 'safety.sos.trigger'),

    -- Extended
    ('extended', 'family.members.view'), ('extended', 'chat.family.participate'), ('extended', 'safety.sos.trigger'),

    -- Caregiver
    ('caregiver', 'family.members.view'), ('caregiver', 'shopping.manage'), ('caregiver', 'chat.family.participate'), ('caregiver', 'safety.sos.trigger')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT fr.id, p.id
FROM role_perm_map m
JOIN public.family_roles fr ON fr.role_key = m.r_key AND fr.family_id IS NULL
JOIN public.permissions p ON p.permission_key = m.p_key
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- ==========================================
-- 0006_security_privileges_and_overrides.sql
-- ==========================================
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


-- ==========================================
-- 0007_anti_escalation_and_audit_triggers.sql
-- ==========================================
-- Migration 0007: Anti-Escalation Guards, Secure Invitation Acceptance, and Audit Triggers

-- 1. Prevent unauthorized role/status escalation on family_members
CREATE OR REPLACE FUNCTION famora.guard_family_member_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_manage BOOLEAN;
  v_old_role_key TEXT;
  v_new_role_key TEXT;
  v_caller_role_key TEXT;
BEGIN
  -- Allow internal/service-role migrations or triggers when auth.uid() is NULL
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_can_manage := famora.has_permission(OLD.family_id, 'family.members.invite_manage');
  v_caller_role_key := famora.member_role_key(OLD.family_id);

  -- Non-managers updating themselves may ONLY change display_name
  IF NOT v_can_manage THEN
    IF NEW.role_id IS DISTINCT FROM OLD.role_id
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.family_id IS DISTINCT FROM OLD.family_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.is_managed_child IS DISTINCT FROM OLD.is_managed_child
      OR NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at THEN
      RAISE EXCEPTION 'Insufficient privileges to modify membership role or status'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Even managers cannot promote someone to owner or demote an owner unless caller is owner
  SELECT role_key INTO v_old_role_key FROM public.family_roles WHERE id = OLD.role_id;
  SELECT role_key INTO v_new_role_key FROM public.family_roles WHERE id = NEW.role_id;

  IF (v_old_role_key = 'owner' OR v_new_role_key = 'owner') AND v_caller_role_key <> 'owner' THEN
    RAISE EXCEPTION 'Only a family owner can transfer or modify owner role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_family_member_mutation
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION famora.guard_family_member_mutation();

-- 2. Secure, atomic invitation acceptance RPC (never trusts client-supplied role or family_id)
CREATE OR REPLACE FUNCTION famora.accept_family_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_token_hash TEXT;
  v_inv RECORD;
  v_member_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_user_id IS NULL OR v_user_email = '' THEN
    RAISE EXCEPTION 'Authentication with verified email is required' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR char_length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = '22023';
  END IF;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv
  FROM public.family_invitations
  WHERE token_hash = v_token_hash
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0002';
  END IF;

  IF lower(v_inv.email) <> v_user_email THEN
    RAISE EXCEPTION 'Invitation email does not match authenticated user' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.family_members (family_id, user_id, role_id, display_name, is_managed_child, status)
  VALUES (
    v_inv.family_id,
    v_user_id,
    v_inv.role_id,
    split_part(v_user_email, '@', 1),
    false,
    'active'
  )
  RETURNING id INTO v_member_id;

  UPDATE public.family_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_inv.id;

  INSERT INTO public.activity_logs (family_id, actor_member_id, action, resource_type, resource_id, metadata)
  VALUES (
    v_inv.family_id,
    v_member_id,
    'invitation.accepted',
    'family_invitations',
    v_inv.id,
    jsonb_build_object('role_id', v_inv.role_id)
  );

  RETURN v_member_id;
END;
$$;

REVOKE ALL ON FUNCTION famora.accept_family_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.accept_family_invitation(TEXT) TO authenticated;

-- 3. Immutable Audit Logging Trigger for Sensitive Operations
CREATE OR REPLACE FUNCTION famora.log_sensitive_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_family_id UUID;
  v_actor_id UUID;
  v_action TEXT;
BEGIN
  v_family_id := COALESCE(NEW.family_id, OLD.family_id);
  v_actor_id := famora.current_member_id(v_family_id);
  v_action := TG_TABLE_NAME || '.' || lower(TG_OP);

  INSERT INTO public.activity_logs (
    family_id,
    actor_member_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  VALUES (
    v_family_id,
    v_actor_id,
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object('op', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_family_members
  AFTER INSERT OR UPDATE OR DELETE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION famora.log_sensitive_activity();

CREATE TRIGGER trg_audit_member_overrides
  AFTER INSERT OR UPDATE OR DELETE ON public.member_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION famora.log_sensitive_activity();

CREATE TRIGGER trg_audit_family_invitations
  AFTER INSERT OR UPDATE ON public.family_invitations
  FOR EACH ROW EXECUTE FUNCTION famora.log_sensitive_activity();


-- ==========================================
-- 0008_auth_profile_trigger.sql
-- ==========================================
-- Migration 0008: Automatic Profile Initialization on User Signup

CREATE OR REPLACE FUNCTION famora.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
    'Famora Member'
  );

  INSERT INTO public.profiles (id, full_name, default_timezone, locale)
  VALUES (
    NEW.id,
    left(v_full_name, 120),
    coalesce(nullif(NEW.raw_user_meta_data ->> 'timezone', ''), 'UTC'),
    coalesce(nullif(NEW.raw_user_meta_data ->> 'locale', ''), 'en-US')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION famora.handle_new_user();


-- ==========================================
-- 0009_family_onboarding_and_rpc.sql
-- ==========================================
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


-- ==========================================
-- 0010_member_management_and_invitations.sql
-- ==========================================
-- Migration 0010: Member Management, Invitation Reject/Preview, and Ownership Transfer RPCs

-- 1. Allow 'rejected' status on family_invitations
ALTER TABLE public.family_invitations
  DROP CONSTRAINT IF EXISTS family_invitations_status_check;

ALTER TABLE public.family_invitations
  ADD CONSTRAINT family_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked', 'expired'));

-- 2. Preview an invitation safely for an authenticated recipient without exposing raw table
CREATE OR REPLACE FUNCTION famora.get_invitation_preview(p_token TEXT)
RETURNS TABLE (
  invitation_id UUID,
  family_id UUID,
  family_name TEXT,
  role_key TEXT,
  role_display_name TEXT,
  invited_email TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_hash TEXT;
BEGIN
  IF auth.uid() IS NULL OR p_token IS NULL OR char_length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  RETURN QUERY
  SELECT
    fi.id,
    fi.family_id,
    f.name,
    fr.role_key,
    fr.display_name,
    fi.email,
    fi.status,
    fi.expires_at
  FROM public.family_invitations fi
  JOIN public.families f ON f.id = fi.family_id
  JOIN public.family_roles fr ON fr.id = fi.role_id
  WHERE fi.token_hash = v_token_hash
    AND f.deleted_at IS NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION famora.get_invitation_preview(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.get_invitation_preview(TEXT) TO authenticated;

-- 3. Reject an invitation safely (verifies recipient email and prevents token reuse)
CREATE OR REPLACE FUNCTION famora.reject_family_invitation(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_email TEXT;
  v_token_hash TEXT;
  v_inv RECORD;
BEGIN
  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF auth.uid() IS NULL OR v_user_email = '' THEN
    RAISE EXCEPTION 'Authentication with verified email is required' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR char_length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = '22023';
  END IF;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv
  FROM public.family_invitations
  WHERE token_hash = v_token_hash
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0002';
  END IF;

  IF lower(v_inv.email) <> v_user_email THEN
    RAISE EXCEPTION 'Invitation email does not match authenticated user' USING ERRCODE = '42501';
  END IF;

  UPDATE public.family_invitations
  SET status = 'rejected'
  WHERE id = v_inv.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.reject_family_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.reject_family_invitation(TEXT) TO authenticated;

-- 4. Atomic Family Ownership Transfer (Owner -> Active Adult/Admin Member)
CREATE OR REPLACE FUNCTION famora.transfer_family_ownership(
  p_family_id UUID,
  p_target_member_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_member_id UUID;
  v_caller_role_key TEXT;
  v_owner_role_id UUID;
  v_admin_role_id UUID;
  v_target RECORD;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_target_member_id IS NULL THEN
    RAISE EXCEPTION 'Invalid ownership transfer parameters' USING ERRCODE = '22023';
  END IF;

  v_caller_member_id := famora.current_member_id(p_family_id);
  v_caller_role_key := famora.member_role_key(p_family_id);

  IF v_caller_member_id IS NULL OR v_caller_role_key <> 'owner' THEN
    RAISE EXCEPTION 'Only the current family owner can transfer ownership' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member_id = p_target_member_id THEN
    RAISE EXCEPTION 'Target member is already the owner' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target
  FROM public.family_members
  WHERE id = p_target_member_id
    AND family_id = p_family_id
    AND status = 'active'
    AND is_managed_child = false
    AND user_id IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target member must be an active non-managed adult account' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.family_roles WHERE role_key = 'owner' AND family_id IS NULL LIMIT 1;
  SELECT id INTO v_admin_role_id FROM public.family_roles WHERE role_key = 'admin' AND family_id IS NULL LIMIT 1;

  UPDATE public.family_members SET role_id = v_owner_role_id WHERE id = p_target_member_id;
  UPDATE public.family_members SET role_id = v_admin_role_id WHERE id = v_caller_member_id;

  INSERT INTO public.activity_logs (family_id, actor_member_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_family_id,
    v_caller_member_id,
    'family.ownership_transferred',
    'family_members',
    p_target_member_id,
    jsonb_build_object('previous_owner_member_id', v_caller_member_id, 'new_owner_member_id', p_target_member_id)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.transfer_family_ownership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.transfer_family_ownership(UUID, UUID) TO authenticated;


-- ==========================================
-- 0011_family_rbac_and_settings.sql
-- ==========================================
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


-- ==========================================
-- 0012_dashboard_domain_tables.sql
-- ==========================================
-- Migration 0012: Core Dashboard Domain Tables (Calendar, Tasks, Announcements, Shopping, Finance)
-- Every table is family-scoped with strict RLS and explicit authenticated privileges.

-- 1. calendar_events
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  location TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'adults_only', 'private')),
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_calendar_event_range CHECK (end_at >= start_at)
);

CREATE INDEX idx_calendar_events_family_start ON public.calendar_events(family_id, start_at);
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  assigned_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'pending_approval', 'done')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_at TIMESTAMPTZ,
  points_value INTEGER NOT NULL DEFAULT 0 CHECK (points_value >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_family_status_due ON public.tasks(family_id, status, due_at);
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. family_announcements
CREATE TABLE public.family_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  author_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  pinned BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_family_created ON public.family_announcements(family_id, pinned DESC, created_at DESC);
CREATE TRIGGER trg_family_announcements_updated_at
  BEFORE UPDATE ON public.family_announcements
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. shopping_items
CREATE TABLE public.shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  added_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'Groceries',
  quantity TEXT NOT NULL DEFAULT '1',
  is_checked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_items_family_checked ON public.shopping_items(family_id, is_checked, created_at DESC);
CREATE TRIGGER trg_shopping_items_updated_at
  BEFORE UPDATE ON public.shopping_items
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. finance_accounts
CREATE TABLE public.finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  account_type TEXT NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking', 'savings', 'cash', 'allowance')),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency_code ~ '^[A-Z]{3}$'),
  balance_cents BIGINT NOT NULL DEFAULT 0,
  monthly_budget_cents BIGINT NOT NULL DEFAULT 0 CHECK (monthly_budget_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_accounts_family ON public.finance_accounts(family_id);
CREATE TRIGGER trg_finance_accounts_updated_at
  BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 6. finance_transactions
CREATE TABLE public.finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  merchant TEXT NOT NULL CHECK (char_length(trim(merchant)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'General',
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_tx_family_date ON public.finance_transactions(family_id, occurred_on DESC);
CREATE TRIGGER trg_finance_transactions_updated_at
  BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_events, public.tasks, public.family_announcements, public.shopping_items, public.finance_accounts, public.finance_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events, public.tasks, public.family_announcements, public.shopping_items, public.finance_accounts, public.finance_transactions TO authenticated;

-- RLS Policies
CREATE POLICY "calendar_events_select_scoped" ON public.calendar_events
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      visibility = 'family'
      OR (visibility = 'adults_only' AND famora.has_permission(family_id, 'calendar.adults_only.view'))
      OR (visibility = 'private' AND created_by_member_id = famora.current_member_id(family_id))
    )
  );

CREATE POLICY "calendar_events_write_permitted" ON public.calendar_events
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'calendar.family.manage'))
  WITH CHECK (famora.has_permission(family_id, 'calendar.family.manage'));

CREATE POLICY "tasks_select_member" ON public.tasks
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "tasks_write_permitted_or_assigned" ON public.tasks
  FOR ALL TO authenticated
  USING (
    famora.has_permission(family_id, 'tasks.manage_all')
    OR assigned_member_id = famora.current_member_id(family_id)
  )
  WITH CHECK (
    famora.has_permission(family_id, 'tasks.manage_all')
    OR assigned_member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "announcements_select_member" ON public.family_announcements
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "announcements_write_adults" ON public.family_announcements
  FOR ALL TO authenticated
  USING (famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']))
  WITH CHECK (famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']));

CREATE POLICY "shopping_select_member" ON public.shopping_items
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "shopping_write_permitted" ON public.shopping_items
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'shopping.manage'))
  WITH CHECK (famora.has_permission(family_id, 'shopping.manage'));

-- Strict Financial Isolation: unauthorized roles (child, extended, caregiver) get 0 rows
CREATE POLICY "finance_accounts_select_permitted" ON public.finance_accounts
  FOR SELECT TO authenticated
  USING (
    famora.has_permission(family_id, 'finance.accounts.manage')
    OR famora.has_permission(family_id, 'finance.transactions.manage')
  );

CREATE POLICY "finance_accounts_write_managers" ON public.finance_accounts
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.accounts.manage'));

CREATE POLICY "finance_transactions_select_permitted" ON public.finance_transactions
  FOR SELECT TO authenticated
  USING (
    famora.has_permission(family_id, 'finance.accounts.manage')
    OR famora.has_permission(family_id, 'finance.transactions.manage')
  );

CREATE POLICY "finance_transactions_write_permitted" ON public.finance_transactions
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.transactions.manage'));


-- ==========================================
-- 0013_family_calendar_full.sql
-- ==========================================
-- Migration 0013: Full Family Calendar (Recurrence, Participants, Reminders, Visibility, Notifications)

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  ADD COLUMN IF NOT EXISTS event_timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('daily', 'weekly', 'monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS recurrence_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER CHECK (reminder_minutes IS NULL OR reminder_minutes >= 0),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  ADD COLUMN IF NOT EXISTS color_token TEXT NOT NULL DEFAULT 'forest' CHECK (color_token IN ('forest', 'sage', 'peach', 'lavender', 'blush'));

CREATE TABLE public.calendar_event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  rsvp_status TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_calendar_participant UNIQUE (event_id, member_id)
);

CREATE INDEX idx_calendar_participants_event ON public.calendar_event_participants(event_id);
CREATE INDEX idx_calendar_participants_member ON public.calendar_event_participants(member_id);
CREATE TRIGGER trg_calendar_event_participants_updated_at
  BEFORE UPDATE ON public.calendar_event_participants
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  recipient_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  domain TEXT NOT NULL DEFAULT 'calendar',
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  body TEXT NOT NULL DEFAULT '',
  deep_link TEXT NOT NULL DEFAULT '',
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_created ON public.notifications(recipient_member_id, created_at DESC);
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

ALTER TABLE public.calendar_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_event_participants, public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_participants, public.notifications TO authenticated;

CREATE POLICY "calendar_participants_select_member" ON public.calendar_event_participants
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "calendar_participants_manage_or_self_rsvp" ON public.calendar_event_participants
  FOR ALL TO authenticated
  USING (
    famora.has_permission(family_id, 'calendar.family.manage')
    OR member_id = famora.current_member_id(family_id)
  )
  WITH CHECK (
    famora.has_permission(family_id, 'calendar.family.manage')
    OR member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "notifications_select_recipient" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_member_id = famora.current_member_id(family_id));

CREATE POLICY "notifications_insert_family_member" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "notifications_update_recipient" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_member_id = famora.current_member_id(family_id))
  WITH CHECK (recipient_member_id = famora.current_member_id(family_id));


-- ==========================================
-- 0014_family_tasks_full.sql
-- ==========================================
-- Migration 0014: Full Family Task Management (Multiple Assignees, Subtasks, Comments, Attachments, History, Recurrence)

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'household' CHECK (category IN ('household', 'chores', 'school', 'errands', 'health', 'other')),
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL;

-- 1. Multiple assignees per task
CREATE TABLE public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_task_assignee UNIQUE (task_id, member_id)
);

CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_member ON public.task_assignees(member_id);
CREATE TRIGGER trg_task_assignees_updated_at
  BEFORE UPDATE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Subtasks
CREATE TABLE public.task_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_subtasks_task ON public.task_subtasks(task_id, sort_order);
CREATE TRIGGER trg_task_subtasks_updated_at
  BEFORE UPDATE ON public.task_subtasks
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Task comments
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_comments_task ON public.task_comments(task_id, created_at);
CREATE TRIGGER trg_task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Task attachments metadata
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL CHECK (char_length(trim(file_name)) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_attachments_task ON public.task_attachments(task_id);
CREATE TRIGGER trg_task_attachments_updated_at
  BEFORE UPDATE ON public.task_attachments
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. Task history
CREATE TABLE public.task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (char_length(trim(event_type)) BETWEEN 2 AND 60),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_history_task ON public.task_history(task_id, created_at DESC);
CREATE TRIGGER trg_task_history_updated_at
  BEFORE UPDATE ON public.task_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_subtasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.task_assignees, public.task_subtasks, public.task_comments, public.task_attachments, public.task_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignees, public.task_subtasks, public.task_comments, public.task_attachments TO authenticated;
GRANT SELECT, INSERT ON public.task_history TO authenticated;

CREATE POLICY "task_assignees_select_member" ON public.task_assignees
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_assignees_write_manager" ON public.task_assignees
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'tasks.manage_all'))
  WITH CHECK (famora.has_permission(family_id, 'tasks.manage_all'));

CREATE POLICY "task_subtasks_select_member" ON public.task_subtasks
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_subtasks_write_member" ON public.task_subtasks
  FOR ALL TO authenticated
  USING (famora.is_family_member(family_id))
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "task_comments_select_member" ON public.task_comments
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_comments_insert_member" ON public.task_comments
  FOR INSERT TO authenticated WITH CHECK (famora.is_family_member(family_id));
CREATE POLICY "task_comments_delete_author_or_manager" ON public.task_comments
  FOR DELETE TO authenticated
  USING (
    author_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'tasks.manage_all')
  );

CREATE POLICY "task_attachments_select_member" ON public.task_attachments
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_attachments_write_member" ON public.task_attachments
  FOR ALL TO authenticated
  USING (famora.is_family_member(family_id))
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "task_history_select_member" ON public.task_history
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "task_history_insert_member" ON public.task_history
  FOR INSERT TO authenticated WITH CHECK (famora.is_family_member(family_id));


-- ==========================================
-- 0015_chores_and_rewards.sql
-- ==========================================
-- Migration 0015: Household Chores, Approvals, Cooperative Challenges, and Immutable Reward Ledger

-- 1. Chore templates & schedules
CREATE TABLE public.chore_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  default_points INTEGER NOT NULL DEFAULT 10 CHECK (default_points BETWEEN 1 AND 1000),
  schedule_rule TEXT NOT NULL DEFAULT 'daily' CHECK (schedule_rule IN ('daily', 'weekly', 'monthly', 'once')),
  category TEXT NOT NULL DEFAULT 'household' CHECK (category IN ('kitchen', 'bedroom', 'outdoor', 'pets', 'study', 'household')),
  assigned_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chore_templates_family ON public.chore_templates(family_id, is_active);
CREATE TRIGGER trg_chore_templates_updated_at
  BEFORE UPDATE ON public.chore_templates
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Chore completion submissions
CREATE TABLE public.chore_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.chore_templates(id) ON DELETE SET NULL,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  points_value INTEGER NOT NULL CHECK (points_value BETWEEN 1 AND 1000),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'needs_retry')),
  reviewed_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chore_submissions_family_status ON public.chore_submissions(family_id, status, created_at DESC);
CREATE TRIGGER trg_chore_submissions_updated_at
  BEFORE UPDATE ON public.chore_submissions
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Reward catalog
CREATE TABLE public.reward_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  cost_points INTEGER NOT NULL CHECK (cost_points > 0 AND cost_points <= 10000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reward_catalog_family ON public.reward_catalog(family_id, is_active);
CREATE TRIGGER trg_reward_catalog_updated_at
  BEFORE UPDATE ON public.reward_catalog
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Immutable reward points ledger (NO direct client INSERT/UPDATE/DELETE)
CREATE TABLE public.reward_points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  delta_points INTEGER NOT NULL CHECK (delta_points <> 0),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 200),
  source_type TEXT NOT NULL CHECK (source_type IN ('chore_approval', 'reward_redemption', 'challenge_bonus')),
  source_id UUID,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reward_ledger_family_member ON public.reward_points_ledger(family_id, member_id, created_at DESC);
CREATE TRIGGER trg_reward_points_ledger_updated_at
  BEFORE UPDATE ON public.reward_points_ledger
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. Cooperative family challenges (positive reinforcement, no punitive rankings)
CREATE TABLE public.family_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  description TEXT NOT NULL DEFAULT '',
  target_chores INTEGER NOT NULL CHECK (target_chores BETWEEN 1 AND 500),
  current_chores INTEGER NOT NULL DEFAULT 0 CHECK (current_chores >= 0),
  bonus_points INTEGER NOT NULL DEFAULT 25 CHECK (bonus_points >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_challenges_family ON public.family_challenges(family_id, status);
CREATE TRIGGER trg_family_challenges_updated_at
  BEFORE UPDATE ON public.family_challenges
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.chore_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chore_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reward_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_points_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_challenges FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.chore_templates, public.chore_submissions, public.reward_catalog, public.reward_points_ledger, public.family_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_templates, public.chore_submissions, public.reward_catalog, public.family_challenges TO authenticated;
-- Ledger is strictly read-only for authenticated; mutations occur only via SECURITY DEFINER RPCs
GRANT SELECT ON public.reward_points_ledger TO authenticated;

CREATE POLICY "chore_templates_select_member" ON public.chore_templates
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "chore_templates_write_manager" ON public.chore_templates
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'tasks.approve_chores'))
  WITH CHECK (famora.has_permission(family_id, 'tasks.approve_chores'));

CREATE POLICY "chore_submissions_select_member" ON public.chore_submissions
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "chore_submissions_insert_self" ON public.chore_submissions
  FOR INSERT TO authenticated
  WITH CHECK (famora.is_family_member(family_id) AND member_id = famora.current_member_id(family_id));
CREATE POLICY "chore_submissions_update_approver" ON public.chore_submissions
  FOR UPDATE TO authenticated
  USING (famora.has_permission(family_id, 'tasks.approve_chores'))
  WITH CHECK (famora.has_permission(family_id, 'tasks.approve_chores'));

CREATE POLICY "reward_catalog_select_member" ON public.reward_catalog
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "reward_catalog_write_approver" ON public.reward_catalog
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'tasks.approve_chores'))
  WITH CHECK (famora.has_permission(family_id, 'tasks.approve_chores'));

CREATE POLICY "reward_ledger_select_member" ON public.reward_points_ledger
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));

CREATE POLICY "family_challenges_select_member" ON public.family_challenges
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "family_challenges_write_approver" ON public.family_challenges
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'tasks.approve_chores'))
  WITH CHECK (famora.has_permission(family_id, 'tasks.approve_chores'));

-- Hardened RPC: Approve chore submission & credit ledger atomically
CREATE OR REPLACE FUNCTION famora.approve_chore_submission(
  p_submission_id UUID,
  p_approved BOOLEAN,
  p_note TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub RECORD;
  v_caller_member_id UUID;
BEGIN
  IF auth.uid() IS NULL OR p_submission_id IS NULL THEN
    RAISE EXCEPTION 'Invalid submission approval request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sub
  FROM public.chore_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chore submission not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT famora.has_permission(v_sub.family_id, 'tasks.approve_chores') THEN
    RAISE EXCEPTION 'Insufficient privileges to approve chores' USING ERRCODE = '42501';
  END IF;

  IF v_sub.status = 'approved' THEN
    RETURN true;
  END IF;

  v_caller_member_id := famora.current_member_id(v_sub.family_id);

  UPDATE public.chore_submissions
  SET
    status = CASE WHEN p_approved THEN 'approved' ELSE 'needs_retry' END,
    reviewed_by_member_id = v_caller_member_id,
    reviewed_at = now(),
    note = coalesce(nullif(trim(p_note), ''), note)
  WHERE id = v_sub.id;

  IF p_approved THEN
    INSERT INTO public.reward_points_ledger (
      family_id, member_id, delta_points, reason, source_type, source_id, created_by_member_id
    )
    VALUES (
      v_sub.family_id,
      v_sub.member_id,
      v_sub.points_value,
      'Completed chore: ' || v_sub.title,
      'chore_approval',
      v_sub.id,
      v_caller_member_id
    );

    UPDATE public.family_challenges
    SET
      current_chores = current_chores + 1,
      status = CASE WHEN current_chores + 1 >= target_chores THEN 'completed' ELSE 'active' END
    WHERE family_id = v_sub.family_id
      AND status = 'active';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.approve_chore_submission(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.approve_chore_submission(UUID, BOOLEAN, TEXT) TO authenticated;

-- Hardened RPC: Redeem a reward safely after verifying points balance
CREATE OR REPLACE FUNCTION famora.redeem_family_reward(
  p_family_id UUID,
  p_reward_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_member_id UUID;
  v_reward RECORD;
  v_balance INTEGER;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_reward_id IS NULL THEN
    RAISE EXCEPTION 'Invalid reward redemption request' USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'child_dev.rewards.redeem') THEN
    RAISE EXCEPTION 'Insufficient privileges to redeem rewards' USING ERRCODE = '42501';
  END IF;

  v_caller_member_id := famora.current_member_id(p_family_id);
  IF v_caller_member_id IS NULL THEN
    RAISE EXCEPTION 'Active membership required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reward
  FROM public.reward_catalog
  WHERE id = p_reward_id AND family_id = p_family_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reward not available' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(delta_points), 0)::INTEGER INTO v_balance
  FROM public.reward_points_ledger
  WHERE family_id = p_family_id AND member_id = v_caller_member_id;

  IF v_balance < v_reward.cost_points THEN
    RAISE EXCEPTION 'Not enough points to redeem this reward' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reward_points_ledger (
    family_id, member_id, delta_points, reason, source_type, source_id, created_by_member_id
  )
  VALUES (
    p_family_id,
    v_caller_member_id,
    -v_reward.cost_points,
    'Redeemed: ' || v_reward.title,
    'reward_redemption',
    v_reward.id,
    v_caller_member_id
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.redeem_family_reward(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.redeem_family_reward(UUID, UUID) TO authenticated;


-- ==========================================
-- 0016_family_shopping_full.sql
-- ==========================================
-- Migration 0016: Collaborative Family Shopping Lists, Templates, Item History, and Realtime

-- 1. Multiple shopping lists
CREATE TABLE public.shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  store_name TEXT NOT NULL DEFAULT '',
  assigned_shopper_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_lists_family ON public.shopping_lists(family_id, is_archived);
CREATE TRIGGER trg_shopping_lists_updated_at
  BEFORE UPDATE ON public.shopping_lists
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Extend shopping_items for collaborative & offline-ready operations
ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS estimated_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (estimated_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 300),
  ADD COLUMN IF NOT EXISTS assigned_shopper_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_mutation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shopping_items_client_mutation
  ON public.shopping_items(family_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON public.shopping_items(list_id, is_checked);

-- 3. Shopping list templates
CREATE TABLE public.shopping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  items_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_templates_family ON public.shopping_templates(family_id);
CREATE TRIGGER trg_shopping_templates_updated_at
  BEFORE UPDATE ON public.shopping_templates
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Item purchase history for quick re-add
CREATE TABLE public.shopping_item_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL CHECK (char_length(trim(item_name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'Groceries',
  last_quantity TEXT NOT NULL DEFAULT '1',
  last_unit TEXT NOT NULL DEFAULT 'pcs',
  last_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (last_price_cents >= 0),
  purchase_count INTEGER NOT NULL DEFAULT 1 CHECK (purchase_count >= 1),
  last_purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_shopping_history_item UNIQUE (family_id, item_name)
);

CREATE INDEX idx_shopping_history_family_count ON public.shopping_item_history(family_id, purchase_count DESC);
CREATE TRIGGER trg_shopping_item_history_updated_at
  BEFORE UPDATE ON public.shopping_item_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_item_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_item_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.shopping_lists, public.shopping_templates, public.shopping_item_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists, public.shopping_templates, public.shopping_item_history TO authenticated;

CREATE POLICY "shopping_lists_select_member" ON public.shopping_lists
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "shopping_lists_write_permitted" ON public.shopping_lists
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'shopping.manage'))
  WITH CHECK (famora.has_permission(family_id, 'shopping.manage'));

CREATE POLICY "shopping_templates_select_member" ON public.shopping_templates
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "shopping_templates_write_permitted" ON public.shopping_templates
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'shopping.manage'))
  WITH CHECK (famora.has_permission(family_id, 'shopping.manage'));

CREATE POLICY "shopping_history_select_member" ON public.shopping_item_history
  FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "shopping_history_write_permitted" ON public.shopping_item_history
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'shopping.manage'))
  WITH CHECK (famora.has_permission(family_id, 'shopping.manage'));

-- Enable Realtime replication if publication exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_lists;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;


-- ==========================================
-- 0017_announcements_and_polls.sql
-- ==========================================
-- Migration 0017: Family Announcements (Audience, Read Tracking, Archive) & Secure Polls

-- 1. Extend family_announcements
ALTER TABLE public.family_announcements
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'adults_only', 'children_teens')),
  ADD COLUMN IF NOT EXISTS attachments_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "announcements_select_member" ON public.family_announcements;
CREATE POLICY "announcements_select_targeted" ON public.family_announcements
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      audience = 'all'
      OR (audience = 'adults_only' AND famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']))
      OR (audience = 'children_teens' AND famora.has_role(family_id, ARRAY['owner', 'admin', 'adult', 'teen', 'child']))
    )
  );

-- 2. Announcement read tracking
CREATE TABLE public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES public.family_announcements(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_announcement_read UNIQUE (announcement_id, member_id)
);

CREATE INDEX idx_announcement_reads_ann ON public.announcement_reads(announcement_id);
CREATE TRIGGER trg_announcement_reads_updated_at
  BEFORE UPDATE ON public.announcement_reads
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Family polls
CREATE TABLE public.family_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  question TEXT NOT NULL CHECK (char_length(trim(question)) BETWEEN 3 AND 240),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  allow_multiple BOOLEAN NOT NULL DEFAULT false,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  allow_vote_edit BOOLEAN NOT NULL DEFAULT true,
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'adults_only')),
  expires_at TIMESTAMPTZ,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_polls_family ON public.family_polls(family_id, created_at DESC);
CREATE TRIGGER trg_family_polls_updated_at
  BEFORE UPDATE ON public.family_polls
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.family_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  poll_id UUID NOT NULL REFERENCES public.family_polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 120),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poll_options_poll ON public.family_poll_options(poll_id, sort_order);
CREATE TRIGGER trg_family_poll_options_updated_at
  BEFORE UPDATE ON public.family_poll_options
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.family_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  poll_id UUID NOT NULL REFERENCES public.family_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.family_poll_options(id) ON DELETE CASCADE,
  voter_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_poll_vote_option_member UNIQUE (poll_id, option_id, voter_member_id)
);

CREATE INDEX idx_poll_votes_poll ON public.family_poll_votes(poll_id);
CREATE TRIGGER trg_family_poll_votes_updated_at
  BEFORE UPDATE ON public.family_poll_votes
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_polls FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_poll_options FORCE ROW LEVEL SECURITY;
ALTER TABLE public.family_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_poll_votes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.announcement_reads, public.family_polls, public.family_poll_options, public.family_poll_votes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_reads, public.family_polls, public.family_poll_options TO authenticated;
-- Direct votes SELECT is restricted; writes go through cast_poll_vote RPC
GRANT SELECT ON public.family_poll_votes TO authenticated;

CREATE POLICY "announcement_reads_member" ON public.announcement_reads
  FOR ALL TO authenticated
  USING (famora.is_family_member(family_id))
  WITH CHECK (famora.is_family_member(family_id) AND member_id = famora.current_member_id(family_id));

CREATE POLICY "family_polls_select_scoped" ON public.family_polls
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      visibility = 'family'
      OR (visibility = 'adults_only' AND famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']))
    )
  );

CREATE POLICY "family_polls_write_adults" ON public.family_polls
  FOR ALL TO authenticated
  USING (famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']))
  WITH CHECK (famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']));

CREATE POLICY "poll_options_select_scoped" ON public.family_poll_options
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_polls p
      WHERE p.id = family_poll_options.poll_id
        AND famora.is_family_member(p.family_id)
        AND (p.visibility = 'family' OR famora.has_role(p.family_id, ARRAY['owner', 'admin', 'adult']))
    )
  );

CREATE POLICY "poll_options_write_adults" ON public.family_poll_options
  FOR ALL TO authenticated
  USING (famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']))
  WITH CHECK (famora.has_role(family_id, ARRAY['owner', 'admin', 'adult']));

-- Protect anonymous votes: members only see non-anonymous votes or their own vote rows
CREATE POLICY "poll_votes_select_privacy" ON public.family_poll_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_polls p
      WHERE p.id = family_poll_votes.poll_id
        AND famora.is_family_member(p.family_id)
        AND (p.visibility = 'family' OR famora.has_role(p.family_id, ARRAY['owner', 'admin', 'adult']))
        AND (p.is_anonymous = false OR family_poll_votes.voter_member_id = famora.current_member_id(p.family_id))
    )
  );

-- Hardened RPC: Server-enforced poll voting
CREATE OR REPLACE FUNCTION famora.cast_poll_vote(
  p_poll_id UUID,
  p_option_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_poll RECORD;
  v_member_id UUID;
  v_existing_count INTEGER;
  v_valid_options INTEGER;
  v_opt_id UUID;
BEGIN
  IF auth.uid() IS NULL OR p_poll_id IS NULL OR p_option_ids IS NULL OR array_length(p_option_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Invalid poll vote parameters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_poll FROM public.family_polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll not found' USING ERRCODE = 'P0002';
  END IF;

  v_member_id := famora.current_member_id(v_poll.family_id);
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Active family membership required' USING ERRCODE = '42501';
  END IF;

  IF v_poll.visibility = 'adults_only' AND NOT famora.has_role(v_poll.family_id, ARRAY['owner', 'admin', 'adult']) THEN
    RAISE EXCEPTION 'Not authorized to vote in this private poll' USING ERRCODE = '42501';
  END IF;

  IF v_poll.is_closed OR (v_poll.expires_at IS NOT NULL AND v_poll.expires_at <= now()) THEN
    RAISE EXCEPTION 'This poll has expired or closed' USING ERRCODE = '22023';
  END IF;

  IF NOT v_poll.allow_multiple AND array_length(p_option_ids, 1) > 1 THEN
    RAISE EXCEPTION 'This poll allows only a single selection' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.family_poll_votes
  WHERE poll_id = p_poll_id AND voter_member_id = v_member_id;

  IF v_existing_count > 0 AND NOT v_poll.allow_vote_edit THEN
    RAISE EXCEPTION 'Vote editing is disabled for this poll' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_valid_options
  FROM public.family_poll_options
  WHERE poll_id = p_poll_id AND id = ANY(p_option_ids);

  IF v_valid_options <> array_length(p_option_ids, 1) THEN
    RAISE EXCEPTION 'One or more options do not belong to this poll' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.family_poll_votes
  WHERE poll_id = p_poll_id AND voter_member_id = v_member_id;

  FOREACH v_opt_id IN ARRAY p_option_ids LOOP
    INSERT INTO public.family_poll_votes (family_id, poll_id, option_id, voter_member_id)
    VALUES (v_poll.family_id, p_poll_id, v_opt_id, v_member_id)
    ON CONFLICT (poll_id, option_id, voter_member_id) DO NOTHING;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.cast_poll_vote(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.cast_poll_vote(UUID, UUID[]) TO authenticated;

-- Aggregated poll results (protects anonymous voter identities)
CREATE OR REPLACE FUNCTION famora.get_poll_vote_counts(p_family_id UUID)
RETURNS TABLE (
  poll_id UUID,
  option_id UUID,
  vote_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR NOT famora.is_family_member(p_family_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v.poll_id, v.option_id, COUNT(*)::INTEGER
  FROM public.family_poll_votes v
  JOIN public.family_polls p ON p.id = v.poll_id
  WHERE v.family_id = p_family_id
    AND (p.visibility = 'family' OR famora.has_role(p.family_id, ARRAY['owner', 'admin', 'adult']))
  GROUP BY v.poll_id, v.option_id;
END;
$$;

REVOKE ALL ON FUNCTION famora.get_poll_vote_counts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.get_poll_vote_counts(UUID) TO authenticated;


-- ==========================================
-- 0018_family_finance_core.sql
-- ==========================================
-- Migration 0018: Family Finance Core (NUMERIC Monetary Precision, Atomic Transfers, Safe Reversals, Audit History)

-- 1. Extend finance_accounts with NUMERIC(18,2) and ownership scope
ALTER TABLE public.finance_accounts
  ADD COLUMN IF NOT EXISTS ownership_scope TEXT NOT NULL DEFAULT 'family' CHECK (ownership_scope IN ('family', 'personal')),
  ADD COLUMN IF NOT EXISTS owner_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'bank' CHECK (account_kind IN ('bank', 'cash', 'savings', 'allowance', 'custom')),
  ADD COLUMN IF NOT EXISTS balance_numeric NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS monthly_budget_numeric NUMERIC(18, 2) NOT NULL DEFAULT 0.00 CHECK (monthly_budget_numeric >= 0);

-- 2. Extend finance_transactions with NUMERIC(18,2), transfers, idempotency, and safe reversals
ALTER TABLE public.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_kind_check;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_kind_check
  CHECK (kind IN ('income', 'expense', 'transfer', 'reversal'));

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS amount_numeric NUMERIC(18, 2) NOT NULL DEFAULT 0.00 CHECK (amount_numeric >= 0),
  ADD COLUMN IF NOT EXISTS transfer_account_id UUID REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS reversed_transaction_id UUID REFERENCES public.finance_transactions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_tx_idempotency
  ON public.finance_transactions(family_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Finance categories
CREATE TABLE public.finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  icon_key TEXT NOT NULL DEFAULT 'tag',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_finance_category_name UNIQUE (family_id, name, kind)
);

CREATE INDEX idx_finance_categories_family ON public.finance_categories(family_id);
CREATE TRIGGER trg_finance_categories_updated_at
  BEFORE UPDATE ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Immutable financial audit history
CREATE TABLE public.finance_audit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (char_length(trim(event_type)) BETWEEN 2 AND 60),
  account_id UUID REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  amount_numeric NUMERIC(18, 2),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_audit_family ON public.finance_audit_history(family_id, created_at DESC);
CREATE TRIGGER trg_finance_audit_history_updated_at
  BEFORE UPDATE ON public.finance_audit_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.finance_categories, public.finance_audit_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;
GRANT SELECT ON public.finance_audit_history TO authenticated;

-- Tighten finance_accounts & finance_transactions RLS for personal vs family ownership
DROP POLICY IF EXISTS "finance_accounts_select_permitted" ON public.finance_accounts;
CREATE POLICY "finance_accounts_select_scoped" ON public.finance_accounts
  FOR SELECT TO authenticated
  USING (
    (
      ownership_scope = 'family'
      AND (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'))
    )
    OR (
      ownership_scope = 'personal'
      AND owner_member_id = famora.current_member_id(family_id)
      AND famora.has_permission(family_id, 'finance.transactions.manage')
    )
  );

DROP POLICY IF EXISTS "finance_transactions_select_permitted" ON public.finance_transactions;
CREATE POLICY "finance_transactions_select_scoped" ON public.finance_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.finance_accounts fa
      WHERE fa.id = finance_transactions.account_id
        AND (
          (fa.ownership_scope = 'family' AND (famora.has_permission(fa.family_id, 'finance.accounts.manage') OR famora.has_permission(fa.family_id, 'finance.transactions.manage')))
          OR (fa.ownership_scope = 'personal' AND fa.owner_member_id = famora.current_member_id(fa.family_id))
        )
    )
  );

-- Prevent silent deletion/overwrite of transactions directly
REVOKE DELETE ON public.finance_transactions FROM authenticated;

CREATE POLICY "finance_categories_select_permitted" ON public.finance_categories
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage') OR famora.has_permission(family_id, 'finance.accounts.manage'));

CREATE POLICY "finance_categories_write_permitted" ON public.finance_categories
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.accounts.manage'));

CREATE POLICY "finance_audit_select_permitted" ON public.finance_audit_history
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));

-- Atomic RPC: Record income, expense, or transfer using NUMERIC(18,2)
CREATE OR REPLACE FUNCTION famora.record_finance_transaction(
  p_family_id UUID,
  p_account_id UUID,
  p_kind TEXT,
  p_amount NUMERIC(18, 2),
  p_merchant TEXT,
  p_category TEXT,
  p_occurred_on DATE,
  p_notes TEXT DEFAULT '',
  p_transfer_account_id UUID DEFAULT NULL,
  p_attachment_name TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_id UUID;
  v_existing_id UUID;
  v_src RECORD;
  v_dst RECORD;
  v_tx_id UUID;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_account_id IS NULL THEN
    RAISE EXCEPTION 'Invalid transaction parameters' USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'finance.transactions.manage') THEN
    RAISE EXCEPTION 'Insufficient privileges for financial transactions' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Invalid transaction kind' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Transaction amount must be positive' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.finance_transactions
    WHERE family_id = p_family_id AND idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  v_member_id := famora.current_member_id(p_family_id);

  SELECT * INTO v_src
  FROM public.finance_accounts
  WHERE id = p_account_id AND family_id = p_family_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source account not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_src.ownership_scope = 'personal' AND v_src.owner_member_id <> v_member_id THEN
    RAISE EXCEPTION 'Not authorized to access this personal account' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'transfer' THEN
    IF p_transfer_account_id IS NULL OR p_transfer_account_id = p_account_id THEN
      RAISE EXCEPTION 'Transfer requires a different destination account' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_dst
    FROM public.finance_accounts
    WHERE id = p_transfer_account_id AND family_id = p_family_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Destination account not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.finance_accounts
    SET balance_numeric = balance_numeric - p_amount
    WHERE id = v_src.id;

    UPDATE public.finance_accounts
    SET balance_numeric = balance_numeric + p_amount
    WHERE id = v_dst.id;
  ELSIF p_kind = 'income' THEN
    UPDATE public.finance_accounts
    SET balance_numeric = balance_numeric + p_amount
    WHERE id = v_src.id;
  ELSE
    UPDATE public.finance_accounts
    SET balance_numeric = balance_numeric - p_amount
    WHERE id = v_src.id;
  END IF;

  INSERT INTO public.finance_transactions (
    family_id, account_id, member_id, merchant, category, kind,
    amount_cents, amount_numeric, occurred_on, transfer_account_id,
    notes, attachment_name, idempotency_key
  )
  VALUES (
    p_family_id, p_account_id, v_member_id, trim(p_merchant), trim(p_category), p_kind,
    (p_amount * 100)::BIGINT, p_amount, coalesce(p_occurred_on, CURRENT_DATE), p_transfer_account_id,
    coalesce(trim(p_notes), ''), p_attachment_name, p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.finance_audit_history (
    family_id, actor_member_id, event_type, account_id, transaction_id, amount_numeric, details
  )
  VALUES (
    p_family_id, v_member_id, 'transaction.' || p_kind, p_account_id, v_tx_id, p_amount,
    jsonb_build_object('merchant', trim(p_merchant), 'category', trim(p_category))
  );

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION famora.record_finance_transaction(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.record_finance_transaction(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- Atomic RPC: Safe reversal of a financial transaction (never silently overwrites)
CREATE OR REPLACE FUNCTION famora.reverse_finance_transaction(
  p_family_id UUID,
  p_transaction_id UUID,
  p_reason TEXT DEFAULT 'Manual reversal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_id UUID;
  v_tx RECORD;
  v_reversal_id UUID;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Invalid reversal request' USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'finance.transactions.manage') THEN
    RAISE EXCEPTION 'Insufficient privileges to reverse transactions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tx
  FROM public.finance_transactions
  WHERE id = p_transaction_id AND family_id = p_family_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tx.is_reversed OR v_tx.kind = 'reversal' THEN
    RAISE EXCEPTION 'Transaction has already been reversed' USING ERRCODE = '22023';
  END IF;

  v_member_id := famora.current_member_id(p_family_id);

  IF v_tx.kind = 'income' THEN
    UPDATE public.finance_accounts SET balance_numeric = balance_numeric - v_tx.amount_numeric WHERE id = v_tx.account_id;
  ELSIF v_tx.kind = 'expense' THEN
    UPDATE public.finance_accounts SET balance_numeric = balance_numeric + v_tx.amount_numeric WHERE id = v_tx.account_id;
  ELSIF v_tx.kind = 'transfer' AND v_tx.transfer_account_id IS NOT NULL THEN
    UPDATE public.finance_accounts SET balance_numeric = balance_numeric + v_tx.amount_numeric WHERE id = v_tx.account_id;
    UPDATE public.finance_accounts SET balance_numeric = balance_numeric - v_tx.amount_numeric WHERE id = v_tx.transfer_account_id;
  END IF;

  UPDATE public.finance_transactions SET is_reversed = true WHERE id = v_tx.id;

  INSERT INTO public.finance_transactions (
    family_id, account_id, member_id, merchant, category, kind,
    amount_cents, amount_numeric, occurred_on, notes, reversed_transaction_id
  )
  VALUES (
    p_family_id, v_tx.account_id, v_member_id, 'Reversal: ' || v_tx.merchant, v_tx.category, 'reversal',
    v_tx.amount_cents, v_tx.amount_numeric, CURRENT_DATE, coalesce(nullif(trim(p_reason), ''), 'Reversal'), v_tx.id
  )
  RETURNING id INTO v_reversal_id;

  INSERT INTO public.finance_audit_history (
    family_id, actor_member_id, event_type, account_id, transaction_id, amount_numeric, details
  )
  VALUES (
    p_family_id, v_member_id, 'transaction.reversed', v_tx.account_id, v_reversal_id, v_tx.amount_numeric,
    jsonb_build_object('reversed_tx_id', v_tx.id, 'reason', p_reason)
  );

  RETURN v_reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION famora.reverse_finance_transaction(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.reverse_finance_transaction(UUID, UUID, TEXT) TO authenticated;


-- ==========================================
-- 0019_budgets_and_bills.sql
-- ==========================================
-- Migration 0019: Family Budgets, Recurring Schedules, Household Bills, and Idempotent Automation

-- 1. Category & Period Budgets
CREATE TABLE public.finance_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  category TEXT NOT NULL CHECK (char_length(trim(category)) BETWEEN 1 AND 60),
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  limit_numeric NUMERIC(18, 2) NOT NULL CHECK (limit_numeric > 0),
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 10 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_budget_period CHECK (period_end >= period_start)
);

CREATE INDEX idx_finance_budgets_family ON public.finance_budgets(family_id, period_start, period_end);
CREATE TRIGGER trg_finance_budgets_updated_at
  BEFORE UPDATE ON public.finance_budgets
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Recurring Income & Expense Schedules
CREATE TABLE public.recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  merchant TEXT NOT NULL CHECK (char_length(trim(merchant)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'General',
  amount_numeric NUMERIC(18, 2) NOT NULL CHECK (amount_numeric > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  next_run_on DATE NOT NULL,
  last_run_on DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_schedules_family_next ON public.recurring_schedules(family_id, is_active, next_run_on);
CREATE TRIGGER trg_recurring_schedules_updated_at
  BEFORE UPDATE ON public.recurring_schedules
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Household Bills (never auto-marked paid without verified action)
CREATE TABLE public.household_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  payee TEXT NOT NULL CHECK (char_length(trim(payee)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'Utilities',
  amount_numeric NUMERIC(18, 2) NOT NULL CHECK (amount_numeric > 0),
  due_on DATE NOT NULL,
  recurrence_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (recurrence_frequency IN ('once', 'monthly', 'quarterly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  paid_at TIMESTAMPTZ,
  paid_transaction_id UUID REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_household_bills_family_due ON public.household_bills(family_id, status, due_on);
CREATE TRIGGER trg_household_bills_updated_at
  BEFORE UPDATE ON public.household_bills
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Bill Payment History
CREATE TABLE public.bill_payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES public.household_bills(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.finance_transactions(id) ON DELETE RESTRICT,
  paid_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  amount_numeric NUMERIC(18, 2) NOT NULL CHECK (amount_numeric > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bill_payment_history_family ON public.bill_payment_history(family_id, paid_at DESC);
CREATE TRIGGER trg_bill_payment_history_updated_at
  BEFORE UPDATE ON public.bill_payment_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.finance_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.household_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_bills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bill_payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_payment_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.finance_budgets, public.recurring_schedules, public.household_bills, public.bill_payment_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_budgets, public.recurring_schedules, public.household_bills TO authenticated;
GRANT SELECT ON public.bill_payment_history TO authenticated;

CREATE POLICY "finance_budgets_select" ON public.finance_budgets
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));
CREATE POLICY "finance_budgets_write" ON public.finance_budgets
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.accounts.manage'));

CREATE POLICY "recurring_schedules_select" ON public.recurring_schedules
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));
CREATE POLICY "recurring_schedules_write" ON public.recurring_schedules
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.transactions.manage'));

CREATE POLICY "household_bills_select" ON public.household_bills
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));
CREATE POLICY "household_bills_write" ON public.household_bills
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.transactions.manage'));

CREATE POLICY "bill_payment_history_select" ON public.bill_payment_history
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));

-- Verified Bill Payment RPC
CREATE OR REPLACE FUNCTION famora.pay_household_bill(
  p_family_id UUID,
  p_bill_id UUID,
  p_account_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bill RECORD;
  v_tx_id UUID;
  v_member_id UUID;
  v_next_due DATE;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_bill_id IS NULL OR p_account_id IS NULL THEN
    RAISE EXCEPTION 'Invalid bill payment parameters' USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'finance.transactions.manage') THEN
    RAISE EXCEPTION 'Insufficient privileges to pay household bills' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bill
  FROM public.household_bills
  WHERE id = p_bill_id AND family_id = p_family_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household bill not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_bill.status = 'paid' THEN
    RAISE EXCEPTION 'Bill is already marked paid' USING ERRCODE = '22023';
  END IF;

  v_member_id := famora.current_member_id(p_family_id);

  v_tx_id := famora.record_finance_transaction(
    p_family_id,
    p_account_id,
    'expense',
    v_bill.amount_numeric,
    v_bill.payee,
    v_bill.category,
    CURRENT_DATE,
    'Bill payment: ' || v_bill.title,
    NULL,
    NULL,
    coalesce(p_idempotency_key, 'bill:' || v_bill.id::text)
  );

  UPDATE public.household_bills
  SET status = 'paid', paid_at = now(), paid_transaction_id = v_tx_id
  WHERE id = v_bill.id;

  INSERT INTO public.bill_payment_history (
    family_id, bill_id, transaction_id, paid_by_member_id, amount_numeric
  )
  VALUES (
    p_family_id, v_bill.id, v_tx_id, v_member_id, v_bill.amount_numeric
  );

  IF v_bill.recurrence_frequency <> 'once' THEN
    v_next_due := CASE v_bill.recurrence_frequency
      WHEN 'monthly' THEN (v_bill.due_on + INTERVAL '1 month')::DATE
      WHEN 'quarterly' THEN (v_bill.due_on + INTERVAL '3 months')::DATE
      ELSE (v_bill.due_on + INTERVAL '1 year')::DATE
    END;

    INSERT INTO public.household_bills (
      family_id, account_id, title, payee, category, amount_numeric, due_on, recurrence_frequency, status
    )
    VALUES (
      p_family_id, v_bill.account_id, v_bill.title, v_bill.payee, v_bill.category,
      v_bill.amount_numeric, v_next_due, v_bill.recurrence_frequency, 'unpaid'
    );
  END IF;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION famora.pay_household_bill(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.pay_household_bill(UUID, UUID, UUID, TEXT) TO authenticated;

-- Idempotent Recurring Schedule Generator RPC
CREATE OR REPLACE FUNCTION famora.process_due_recurring_schedules(
  p_family_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sched RECORD;
  v_generated INTEGER := 0;
  v_idem_key TEXT;
  v_next_date DATE;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL THEN
    RAISE EXCEPTION 'Invalid recurring schedule request' USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'finance.transactions.manage') THEN
    RAISE EXCEPTION 'Insufficient privileges to process recurring schedules' USING ERRCODE = '42501';
  END IF;

  FOR v_sched IN
    SELECT * FROM public.recurring_schedules
    WHERE family_id = p_family_id
      AND is_active = true
      AND next_run_on <= p_as_of_date
    FOR UPDATE
  LOOP
    v_idem_key := 'sched:' || v_sched.id::text || ':' || v_sched.next_run_on::text;

    PERFORM famora.record_finance_transaction(
      p_family_id,
      v_sched.account_id,
      v_sched.kind,
      v_sched.amount_numeric,
      v_sched.merchant,
      v_sched.category,
      v_sched.next_run_on,
      'Recurring ' || v_sched.frequency || ' schedule',
      NULL,
      NULL,
      v_idem_key
    );

    v_next_date := CASE v_sched.frequency
      WHEN 'weekly' THEN (v_sched.next_run_on + INTERVAL '7 days')::DATE
      WHEN 'monthly' THEN (v_sched.next_run_on + INTERVAL '1 month')::DATE
      ELSE (v_sched.next_run_on + INTERVAL '1 year')::DATE
    END;

    UPDATE public.recurring_schedules
    SET last_run_on = v_sched.next_run_on, next_run_on = v_next_date
    WHERE id = v_sched.id;

    v_generated := v_generated + 1;
  END LOOP;

  RETURN v_generated;
END;
$$;

REVOKE ALL ON FUNCTION famora.process_due_recurring_schedules(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.process_due_recurring_schedules(UUID, DATE) TO authenticated;


-- ==========================================
-- 0020_financial_analytics_and_goals.sql
-- ==========================================
-- Migration 0020: Savings Goals, Contributions, Debts & Receivables, and Payment Schedules

-- 1. Savings goals
CREATE TABLE public.finance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  target_numeric NUMERIC(18, 2) NOT NULL CHECK (target_numeric > 0),
  current_numeric NUMERIC(18, 2) NOT NULL DEFAULT 0.00 CHECK (current_numeric >= 0),
  target_date DATE,
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'adults_only')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_goals_family ON public.finance_goals(family_id, status);
CREATE TRIGGER trg_finance_goals_updated_at
  BEFORE UPDATE ON public.finance_goals
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Goal contributions
CREATE TABLE public.finance_goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.finance_goals(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  amount_numeric NUMERIC(18, 2) NOT NULL CHECK (amount_numeric > 0),
  contributed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goal_contributions_goal ON public.finance_goal_contributions(goal_id, contributed_on DESC);
CREATE TRIGGER trg_finance_goal_contributions_updated_at
  BEFORE UPDATE ON public.finance_goal_contributions
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Debts & Receivables
CREATE TABLE public.finance_debts_receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('debt', 'receivable')),
  counterparty TEXT NOT NULL CHECK (char_length(trim(counterparty)) BETWEEN 1 AND 120),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  principal_numeric NUMERIC(18, 2) NOT NULL CHECK (principal_numeric > 0),
  remaining_numeric NUMERIC(18, 2) NOT NULL CHECK (remaining_numeric >= 0),
  due_on DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debts_receivables_family ON public.finance_debts_receivables(family_id, kind, status);
CREATE TRIGGER trg_finance_debts_receivables_updated_at
  BEFORE UPDATE ON public.finance_debts_receivables
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Debt / Receivable payment schedule log
CREATE TABLE public.finance_debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL REFERENCES public.finance_debts_receivables(id) ON DELETE CASCADE,
  amount_numeric NUMERIC(18, 2) NOT NULL CHECK (amount_numeric > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_debt_payments_debt ON public.finance_debt_payments(debt_id, paid_on DESC);
CREATE TRIGGER trg_finance_debt_payments_updated_at
  BEFORE UPDATE ON public.finance_debt_payments
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.finance_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_goals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_goal_contributions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_debts_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_debts_receivables FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_debt_payments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.finance_goals, public.finance_goal_contributions, public.finance_debts_receivables, public.finance_debt_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_goals, public.finance_goal_contributions, public.finance_debts_receivables, public.finance_debt_payments TO authenticated;

CREATE POLICY "finance_goals_select" ON public.finance_goals
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));
CREATE POLICY "finance_goals_write" ON public.finance_goals
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.transactions.manage'));

CREATE POLICY "goal_contributions_select" ON public.finance_goal_contributions
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));
CREATE POLICY "goal_contributions_write" ON public.finance_goal_contributions
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.transactions.manage'));

CREATE POLICY "debts_receivables_select" ON public.finance_debts_receivables
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));
CREATE POLICY "debts_receivables_write" ON public.finance_debts_receivables
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.transactions.manage'));

CREATE POLICY "debt_payments_select" ON public.finance_debt_payments
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'finance.accounts.manage') OR famora.has_permission(family_id, 'finance.transactions.manage'));
CREATE POLICY "debt_payments_write" ON public.finance_debt_payments
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'finance.transactions.manage'))
  WITH CHECK (famora.has_permission(family_id, 'finance.transactions.manage'));

-- Atomic RPC: Contribute to savings goal
CREATE OR REPLACE FUNCTION famora.contribute_to_finance_goal(
  p_family_id UUID,
  p_goal_id UUID,
  p_amount NUMERIC(18, 2),
  p_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_id UUID;
  v_goal RECORD;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_goal_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid goal contribution parameters' USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'finance.transactions.manage') THEN
    RAISE EXCEPTION 'Insufficient privileges to contribute to goals' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_goal FROM public.finance_goals WHERE id = p_goal_id AND family_id = p_family_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Savings goal not found' USING ERRCODE = 'P0002';
  END IF;

  v_member_id := famora.current_member_id(p_family_id);

  INSERT INTO public.finance_goal_contributions (family_id, goal_id, member_id, amount_numeric, notes)
  VALUES (p_family_id, p_goal_id, v_member_id, p_amount, coalesce(trim(p_notes), ''));

  UPDATE public.finance_goals
  SET
    current_numeric = current_numeric + p_amount,
    status = CASE WHEN current_numeric + p_amount >= target_numeric THEN 'completed' ELSE 'active' END
  WHERE id = p_goal_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.contribute_to_finance_goal(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.contribute_to_finance_goal(UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- Atomic RPC: Record debt or receivable payment
CREATE OR REPLACE FUNCTION famora.record_debt_payment(
  p_family_id UUID,
  p_debt_id UUID,
  p_amount NUMERIC(18, 2),
  p_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_debt RECORD;
  v_next_remaining NUMERIC(18, 2);
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_debt_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid debt payment parameters' USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'finance.transactions.manage') THEN
    RAISE EXCEPTION 'Insufficient privileges to record debt payments' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_debt FROM public.finance_debts_receivables WHERE id = p_debt_id AND family_id = p_family_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debt/receivable record not found' USING ERRCODE = 'P0002';
  END IF;

  v_next_remaining := GREATEST(0.00, v_debt.remaining_numeric - p_amount);

  INSERT INTO public.finance_debt_payments (family_id, debt_id, amount_numeric, notes)
  VALUES (p_family_id, p_debt_id, p_amount, coalesce(trim(p_notes), ''));

  UPDATE public.finance_debts_receivables
  SET
    remaining_numeric = v_next_remaining,
    status = CASE WHEN v_next_remaining = 0.00 THEN 'settled' ELSE 'open' END
  WHERE id = p_debt_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.record_debt_payment(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.record_debt_payment(UUID, UUID, NUMERIC, TEXT) TO authenticated;


-- ==========================================
-- 0021_child_development.sql
-- ==========================================
-- Migration 0021: Child Development, Growth, Milestones, Education, and Restricted Health Records

-- 1. Granular child development permissions (granted to owner, admin, adult only by default)
INSERT INTO public.permissions (permission_key, domain, description)
VALUES
  ('child_dev.identity.view', 'child-dev', 'View child profiles, birth information, and school identity'),
  ('child_dev.growth_milestones.manage', 'child-dev', 'Record child growth, milestones, and education activities'),
  ('child_dev.health.view', 'child-dev', 'View and record child health, immunization, and appointment logs')
ON CONFLICT (permission_key) DO NOTHING;

WITH perm_map(r_key, p_key) AS (
  VALUES
    ('owner', 'child_dev.identity.view'), ('owner', 'child_dev.growth_milestones.manage'), ('owner', 'child_dev.health.view'),
    ('admin', 'child_dev.identity.view'), ('admin', 'child_dev.growth_milestones.manage'), ('admin', 'child_dev.health.view'),
    ('adult', 'child_dev.identity.view'), ('adult', 'child_dev.growth_milestones.manage'), ('adult', 'child_dev.health.view')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT fr.id, p.id
FROM perm_map m
JOIN public.family_roles fr ON fr.role_key = m.r_key AND fr.family_id IS NULL
JOIN public.permissions p ON p.permission_key = m.p_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2. Child profiles (strictly opted out of AI training at schema level)
CREATE TABLE public.child_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),
  birth_date DATE NOT NULL,
  birth_place TEXT NOT NULL DEFAULT '',
  school_name TEXT NOT NULL DEFAULT '',
  grade_level TEXT NOT NULL DEFAULT '',
  teacher_name TEXT NOT NULL DEFAULT '',
  ai_training_opt_out BOOLEAN NOT NULL DEFAULT true CHECK (ai_training_opt_out = true),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_profiles_family ON public.child_profiles(family_id);
CREATE TRIGGER trg_child_profiles_updated_at
  BEFORE UPDATE ON public.child_profiles
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Growth records (height & weight)
CREATE TABLE public.child_growth_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_profile_id UUID NOT NULL REFERENCES public.child_profiles(id) ON DELETE CASCADE,
  measured_on DATE NOT NULL,
  height_cm NUMERIC(5, 2) NOT NULL CHECK (height_cm BETWEEN 20 AND 250),
  weight_kg NUMERIC(5, 2) NOT NULL CHECK (weight_kg BETWEEN 0.5 AND 200),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_growth_profile ON public.child_growth_records(child_profile_id, measured_on ASC);
CREATE TRIGGER trg_child_growth_records_updated_at
  BEFORE UPDATE ON public.child_growth_records
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Development milestones
CREATE TABLE public.child_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_profile_id UUID NOT NULL REFERENCES public.child_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('physical', 'cognitive', 'social', 'academic', 'activity')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  achieved_on DATE NOT NULL,
  photo_attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_milestones_profile ON public.child_milestones(child_profile_id, achieved_on DESC);
CREATE TRIGGER trg_child_milestones_updated_at
  BEFORE UPDATE ON public.child_milestones
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. Education & academic activity records
CREATE TABLE public.child_education_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_profile_id UUID NOT NULL REFERENCES public.child_profiles(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('school_info', 'academic_activity', 'important_date')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  details TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 800),
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_education_profile ON public.child_education_records(child_profile_id, event_date DESC);
CREATE TRIGGER trg_child_education_records_updated_at
  BEFORE UPDATE ON public.child_education_records
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 6. Restricted health, immunization & appointment records
CREATE TABLE public.child_health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  child_profile_id UUID NOT NULL REFERENCES public.child_profiles(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('immunization', 'appointment', 'checkup', 'allergy_note')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  provider_name TEXT NOT NULL DEFAULT '',
  recorded_on DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 800),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_health_profile ON public.child_health_records(child_profile_id, recorded_on DESC);
CREATE TRIGGER trg_child_health_records_updated_at
  BEFORE UPDATE ON public.child_health_records
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.child_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.child_growth_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_growth_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.child_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_milestones FORCE ROW LEVEL SECURITY;
ALTER TABLE public.child_education_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_education_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.child_health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_health_records FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.child_profiles, public.child_growth_records, public.child_milestones, public.child_education_records, public.child_health_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_profiles, public.child_growth_records, public.child_milestones, public.child_education_records, public.child_health_records TO authenticated;

CREATE POLICY "child_profiles_select_permitted" ON public.child_profiles
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.identity.view'));
CREATE POLICY "child_profiles_write_permitted" ON public.child_profiles
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.manage'))
  WITH CHECK (famora.has_permission(family_id, 'child_dev.manage'));

CREATE POLICY "child_growth_select_permitted" ON public.child_growth_records
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.identity.view'));
CREATE POLICY "child_growth_write_permitted" ON public.child_growth_records
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.growth_milestones.manage'))
  WITH CHECK (famora.has_permission(family_id, 'child_dev.growth_milestones.manage'));

CREATE POLICY "child_milestones_select_permitted" ON public.child_milestones
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.identity.view'));
CREATE POLICY "child_milestones_write_permitted" ON public.child_milestones
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.growth_milestones.manage'))
  WITH CHECK (famora.has_permission(family_id, 'child_dev.growth_milestones.manage'));

CREATE POLICY "child_education_select_permitted" ON public.child_education_records
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.identity.view'));
CREATE POLICY "child_education_write_permitted" ON public.child_education_records
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.growth_milestones.manage'))
  WITH CHECK (famora.has_permission(family_id, 'child_dev.growth_milestones.manage'));

-- Strictest gate on child health records
CREATE POLICY "child_health_select_restricted" ON public.child_health_records
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.health.view'));
CREATE POLICY "child_health_write_restricted" ON public.child_health_records
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'child_dev.health.view'))
  WITH CHECK (famora.has_permission(family_id, 'child_dev.health.view'));


-- ==========================================
-- 0022_household_management.sql
-- ==========================================
-- Migration 0022: Household Inventory, Meal Planning, and Home Asset Management

-- 1. Inventory
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'pantry' CHECK (category IN ('pantry', 'fridge', 'freezer', 'cleaning', 'medicine', 'supplies')),
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  min_threshold NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (min_threshold >= 0),
  expires_on DATE,
  last_purchased_on DATE,
  last_purchase_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (last_purchase_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_items_family ON public.inventory_items(family_id, category);
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  delta_quantity NUMERIC(10, 2) NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('restock', 'consumed', 'expired', 'adjustment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_movements_item ON public.inventory_movements(item_id, created_at DESC);
CREATE TRIGGER trg_inventory_movements_updated_at
  BEFORE UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Meal Planning & Recipes
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  prep_minutes INTEGER NOT NULL DEFAULT 25 CHECK (prep_minutes >= 0),
  servings INTEGER NOT NULL DEFAULT 4 CHECK (servings >= 1),
  dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  ingredients_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipes_family ON public.recipes(family_id);
CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  planned_on DATE NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner')),
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  custom_title TEXT NOT NULL DEFAULT '',
  preferences_note TEXT NOT NULL DEFAULT '',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meal_plans_family_date ON public.meal_plans(family_id, planned_on);
CREATE TRIGGER trg_meal_plans_updated_at
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Home Management
CREATE TABLE public.home_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL DEFAULT 'appliance' CHECK (category IN ('appliance', 'hvac', 'vehicle', 'plumbing', 'electronics', 'structure')),
  brand_model TEXT NOT NULL DEFAULT '',
  purchased_on DATE,
  warranty_expires_on DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_assets_family ON public.home_assets(family_id);
CREATE TRIGGER trg_home_assets_updated_at
  BEFORE UPDATE ON public.home_assets
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.home_service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  specialty TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_providers_family ON public.home_service_providers(family_id);
CREATE TRIGGER trg_home_service_providers_updated_at
  BEFORE UPDATE ON public.home_service_providers
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.home_maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.home_assets(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.home_service_providers(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  interval_days INTEGER NOT NULL DEFAULT 90 CHECK (interval_days >= 1),
  next_due_on DATE NOT NULL,
  last_completed_on DATE,
  calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_maintenance_family_due ON public.home_maintenance_tasks(family_id, next_due_on);
CREATE TRIGGER trg_home_maintenance_tasks_updated_at
  BEFORE UPDATE ON public.home_maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.home_maintenance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  maintenance_task_id UUID NOT NULL REFERENCES public.home_maintenance_tasks(id) ON DELETE CASCADE,
  completed_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  completed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_maint_history_task ON public.home_maintenance_history(maintenance_task_id, completed_on DESC);
CREATE TRIGGER trg_home_maintenance_history_updated_at
  BEFORE UPDATE ON public.home_maintenance_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.home_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.home_maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_maintenance_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.home_maintenance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_maintenance_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.inventory_items, public.inventory_movements, public.recipes, public.meal_plans, public.home_assets, public.home_service_providers, public.home_maintenance_tasks, public.home_maintenance_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items, public.inventory_movements, public.recipes, public.meal_plans, public.home_assets, public.home_service_providers, public.home_maintenance_tasks, public.home_maintenance_history TO authenticated;

CREATE POLICY "inventory_items_select" ON public.inventory_items FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "inventory_items_write" ON public.inventory_items FOR ALL TO authenticated USING (famora.has_permission(family_id, 'inventory.manage')) WITH CHECK (famora.has_permission(family_id, 'inventory.manage'));
CREATE POLICY "inventory_movements_select" ON public.inventory_movements FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "inventory_movements_write" ON public.inventory_movements FOR ALL TO authenticated USING (famora.has_permission(family_id, 'inventory.manage')) WITH CHECK (famora.has_permission(family_id, 'inventory.manage'));

CREATE POLICY "recipes_select" ON public.recipes FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "recipes_write" ON public.recipes FOR ALL TO authenticated USING (famora.has_permission(family_id, 'meals.manage')) WITH CHECK (famora.has_permission(family_id, 'meals.manage'));
CREATE POLICY "meal_plans_select" ON public.meal_plans FOR SELECT TO authenticated USING (famora.is_family_member(family_id));
CREATE POLICY "meal_plans_write" ON public.meal_plans FOR ALL TO authenticated USING (famora.has_permission(family_id, 'meals.manage')) WITH CHECK (famora.has_permission(family_id, 'meals.manage'));

CREATE POLICY "home_assets_select" ON public.home_assets FOR SELECT TO authenticated USING (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_assets_write" ON public.home_assets FOR ALL TO authenticated USING (famora.has_permission(family_id, 'home.manage')) WITH CHECK (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_providers_select" ON public.home_service_providers FOR SELECT TO authenticated USING (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_providers_write" ON public.home_service_providers FOR ALL TO authenticated USING (famora.has_permission(family_id, 'home.manage')) WITH CHECK (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_maint_select" ON public.home_maintenance_tasks FOR SELECT TO authenticated USING (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_maint_write" ON public.home_maintenance_tasks FOR ALL TO authenticated USING (famora.has_permission(family_id, 'home.manage')) WITH CHECK (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_maint_hist_select" ON public.home_maintenance_history FOR SELECT TO authenticated USING (famora.has_permission(family_id, 'home.manage'));
CREATE POLICY "home_maint_hist_write" ON public.home_maintenance_history FOR ALL TO authenticated USING (famora.has_permission(family_id, 'home.manage')) WITH CHECK (famora.has_permission(family_id, 'home.manage'));


-- ==========================================
-- 0023_family_document_vault.sql
-- ==========================================
-- Migration 0023: Family Document Vault (Private Storage Bucket, Metadata, Sharing, Expiration, History)

-- 1. Create private Supabase Storage bucket (public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'family-documents',
  'family-documents',
  false,
  15728640,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Documents metadata table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  owner_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  category TEXT NOT NULL CHECK (category IN ('identity', 'certificates', 'education', 'insurance', 'property', 'vehicles', 'financial', 'other')),
  sensitivity TEXT NOT NULL DEFAULT 'standard' CHECK (sensitivity IN ('standard', 'sensitive_vault')),
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  expires_on DATE,
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 800),
  shared_with_member_ids UUID[] NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_family_cat ON public.documents(family_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_expires ON public.documents(family_id, expires_on) WHERE expires_on IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Document audit history
CREATE TABLE public.document_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('uploaded', 'viewed', 'downloaded', 'shared', 'updated', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_history_doc ON public.document_history(document_id, created_at DESC);
CREATE TRIGGER trg_document_history_updated_at
  BEFORE UPDATE ON public.document_history
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_history FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.documents, public.document_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT ON public.document_history TO authenticated;

CREATE POLICY "documents_select_scoped" ON public.documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (
        sensitivity = 'standard'
        AND (
          famora.has_permission(family_id, 'documents.standard.manage')
          OR owner_member_id = famora.current_member_id(family_id)
          OR famora.current_member_id(family_id) = ANY(shared_with_member_ids)
        )
      )
      OR (
        sensitivity = 'sensitive_vault'
        AND famora.has_permission(family_id, 'documents.sensitive_vault')
      )
    )
  );

CREATE POLICY "documents_insert_permitted" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (sensitivity = 'standard' AND famora.has_permission(family_id, 'documents.standard.manage'))
    OR (sensitivity = 'sensitive_vault' AND famora.has_permission(family_id, 'documents.sensitive_vault'))
  );

CREATE POLICY "documents_update_delete_permitted" ON public.documents
  FOR UPDATE TO authenticated
  USING (
    owner_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'documents.sensitive_vault')
  )
  WITH CHECK (
    owner_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'documents.sensitive_vault')
  );

CREATE POLICY "document_history_select" ON public.document_history
  FOR SELECT TO authenticated
  USING (famora.has_permission(family_id, 'documents.standard.manage') OR famora.has_permission(family_id, 'documents.sensitive_vault'));
CREATE POLICY "document_history_insert" ON public.document_history
  FOR INSERT TO authenticated
  WITH CHECK (famora.is_family_member(family_id));

-- Private Storage Object Policies (path convention: {family_id}/{tier}/{filename})
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "family_docs_storage_select" ON storage.objects;
      CREATE POLICY "family_docs_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'family-documents'
          AND famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
        );

      DROP POLICY IF EXISTS "family_docs_storage_insert" ON storage.objects;
      CREATE POLICY "family_docs_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'family-documents'
          AND famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.standard.manage')
        );

      DROP POLICY IF EXISTS "family_docs_storage_delete" ON storage.objects;
      CREATE POLICY "family_docs_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'family-documents'
          AND famora.has_permission((storage.foldername(name))[1]::uuid, 'documents.sensitive_vault')
        );
    $p$;
  END IF;
END $$;


-- ==========================================
-- 0024_family_chat.sql
-- ==========================================
-- Migration 0024: Family Chat (Group & Private Conversations, Messages, Reactions, Read Receipts, Private Attachments)

-- 1. Create private Supabase Storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Conversations table
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('family_group', 'adults_group', 'direct', 'topic')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 100),
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_conversations_family ON public.chat_conversations(family_id, last_message_at DESC NULLS LAST);
CREATE TRIGGER trg_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Conversation participants + read receipts
CREATE TABLE public.chat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  last_read_message_id UUID,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, member_id)
);

CREATE INDEX idx_chat_participants_member ON public.chat_participants(family_id, member_id);
CREATE TRIGGER trg_chat_participants_updated_at
  BEFORE UPDATE ON public.chat_participants
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Chat messages
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  client_nonce UUID,
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  reply_to_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_mime_type TEXT,
  attachment_size_bytes BIGINT CHECK (attachment_size_bytes IS NULL OR (attachment_size_bytes > 0 AND attachment_size_bytes <= 10485760)),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  pinned_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_content_present CHECK (char_length(trim(body)) > 0 OR attachment_path IS NOT NULL),
  UNIQUE (conversation_id, client_nonce)
);

CREATE INDEX idx_chat_messages_conv_created ON public.chat_messages(conversation_id, created_at DESC, id DESC);
CREATE INDEX idx_chat_messages_pinned ON public.chat_messages(conversation_id, is_pinned) WHERE is_pinned = true AND deleted_at IS NULL;
CREATE TRIGGER trg_chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. Message reactions
CREATE TABLE public.chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(trim(emoji)) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, member_id, emoji)
);

CREATE INDEX idx_chat_reactions_message ON public.chat_message_reactions(message_id);
CREATE TRIGGER trg_chat_message_reactions_updated_at
  BEFORE UPDATE ON public.chat_message_reactions
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 6. Hardened membership check helper for chat conversations
CREATE OR REPLACE FUNCTION famora.is_chat_participant(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, famora
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    JOIN public.chat_conversations cc ON cc.id = cp.conversation_id
    JOIN public.family_members fm ON fm.id = cp.member_id
    WHERE cp.conversation_id = p_conversation_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'active'
      AND (
        cc.kind <> 'adults_group'
        OR famora.has_permission(cc.family_id, 'chat.adults_only.participate')
      )
  );
$$;

REVOKE ALL ON FUNCTION famora.is_chat_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION famora.is_chat_participant(UUID) TO authenticated;

-- 7. Enable & Force RLS + Explicit Privileges
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_reactions TO authenticated;

-- Conversations policies
CREATE POLICY "chat_conversations_select_participant" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (
    famora.is_chat_participant(id)
    OR (
      kind = 'family_group'
      AND famora.has_permission(family_id, 'chat.family.participate')
    )
    OR (
      kind = 'adults_group'
      AND famora.has_permission(family_id, 'chat.adults_only.participate')
    )
  );

CREATE POLICY "chat_conversations_insert_permitted" ON public.chat_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (kind = 'adults_group' AND famora.has_permission(family_id, 'chat.adults_only.participate'))
    OR (kind <> 'adults_group' AND famora.has_permission(family_id, 'chat.family.participate'))
  );

CREATE POLICY "chat_conversations_update_participant" ON public.chat_conversations
  FOR UPDATE TO authenticated
  USING (famora.is_chat_participant(id))
  WITH CHECK (famora.is_chat_participant(id));

-- Participants policies
CREATE POLICY "chat_participants_select_participant" ON public.chat_participants
  FOR SELECT TO authenticated
  USING (famora.is_chat_participant(conversation_id));

CREATE POLICY "chat_participants_insert_permitted" ON public.chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.has_permission(family_id, 'chat.family.participate')
    AND (
      member_id = famora.current_member_id(family_id)
      OR famora.is_chat_participant(conversation_id)
      OR EXISTS (
        SELECT 1 FROM public.chat_conversations cc
        WHERE cc.id = conversation_id AND cc.created_by_member_id = famora.current_member_id(family_id)
      )
    )
  );

CREATE POLICY "chat_participants_update_self" ON public.chat_participants
  FOR UPDATE TO authenticated
  USING (member_id = famora.current_member_id(family_id))
  WITH CHECK (member_id = famora.current_member_id(family_id));

-- Messages policies
CREATE POLICY "chat_messages_select_participant" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (famora.is_chat_participant(conversation_id));

CREATE POLICY "chat_messages_insert_participant" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_chat_participant(conversation_id)
    AND sender_member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "chat_messages_update_participant" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    famora.is_chat_participant(conversation_id)
    AND (
      sender_member_id = famora.current_member_id(family_id)
      OR famora.has_permission(family_id, 'chat.adults_only.participate')
    )
  )
  WITH CHECK (famora.is_chat_participant(conversation_id));

-- Reactions policies
CREATE POLICY "chat_reactions_select_participant" ON public.chat_message_reactions
  FOR SELECT TO authenticated
  USING (famora.is_chat_participant(conversation_id));

CREATE POLICY "chat_reactions_insert_participant" ON public.chat_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_chat_participant(conversation_id)
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "chat_reactions_delete_own" ON public.chat_message_reactions
  FOR DELETE TO authenticated
  USING (
    famora.is_chat_participant(conversation_id)
    AND member_id = famora.current_member_id(family_id)
  );

-- 8. Private Storage Policies (path convention: {family_id}/{conversation_id}/{filename})
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
      CREATE POLICY "chat_attachments_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'chat-attachments'
          AND famora.is_chat_participant((storage.foldername(name))[2]::uuid)
        );

      DROP POLICY IF EXISTS "chat_attachments_insert" ON storage.objects;
      CREATE POLICY "chat_attachments_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'chat-attachments'
          AND famora.is_chat_participant((storage.foldername(name))[2]::uuid)
        );

      DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;
      CREATE POLICY "chat_attachments_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'chat-attachments'
          AND famora.is_chat_participant((storage.foldername(name))[2]::uuid)
        );
    $p$;
  END IF;
END $$;

-- 9. Register tables for Supabase Realtime replication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages, public.chat_message_reactions, public.chat_participants;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- ==========================================
-- 0025_family_memories.sql
-- ==========================================
-- Migration 0025: Family Memories (Private Storage, Albums, Photo/Video Memories, Personal Journals, Favorites)

-- 1. Create private Supabase Storage bucket for family memories
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'family-memories',
  'family-memories',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Memory Albums
CREATE TABLE public.memory_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  cover_storage_path TEXT,
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'adults_only', 'shared', 'private')),
  shared_with_member_ids UUID[] NOT NULL DEFAULT '{}',
  event_name TEXT NOT NULL DEFAULT '' CHECK (char_length(event_name) <= 120),
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_albums_family ON public.memory_albums(family_id, created_at DESC);
CREATE TRIGGER trg_memory_albums_updated_at
  BEFORE UPDATE ON public.memory_albums
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Memory Items (Photos, Videos, Personal Journals, Important Moments)
CREATE TABLE public.memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  album_id UUID REFERENCES public.memory_albums(id) ON DELETE SET NULL,
  author_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video', 'journal')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  journal_entry TEXT NOT NULL DEFAULT '' CHECK (char_length(journal_entry) <= 6000),
  moment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  event_label TEXT NOT NULL DEFAULT '' CHECK (char_length(event_label) <= 100),
  is_important BOOLEAN NOT NULL DEFAULT false,
  visibility TEXT NOT NULL DEFAULT 'family' CHECK (visibility IN ('family', 'adults_only', 'shared', 'private')),
  shared_with_member_ids UUID[] NOT NULL DEFAULT '{}',
  storage_path TEXT,
  thumbnail_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 52428800)),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_items_family_date ON public.memory_items(family_id, moment_date DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_memory_items_album ON public.memory_items(album_id, moment_date DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_memory_items_updated_at
  BEFORE UPDATE ON public.memory_items
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Memory Favorites
CREATE TABLE public.memory_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES public.memory_items(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (memory_id, member_id)
);

CREATE INDEX idx_memory_favorites_member ON public.memory_favorites(family_id, member_id);
CREATE TRIGGER trg_memory_favorites_updated_at
  BEFORE UPDATE ON public.memory_favorites
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.memory_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_albums FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memory_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_favorites FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.memory_albums, public.memory_items, public.memory_favorites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_albums, public.memory_items, public.memory_favorites TO authenticated;

-- Album Policies
CREATE POLICY "memory_albums_select_scoped" ON public.memory_albums
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      visibility = 'family'
      OR created_by_member_id = famora.current_member_id(family_id)
      OR (visibility = 'shared' AND famora.current_member_id(family_id) = ANY(shared_with_member_ids))
      OR (visibility = 'adults_only' AND famora.has_permission(family_id, 'memories.manage'))
    )
  );

CREATE POLICY "memory_albums_insert_permitted" ON public.memory_albums
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND (visibility = 'private' OR famora.has_permission(family_id, 'memories.manage'))
  );

CREATE POLICY "memory_albums_update_owner_or_manager" ON public.memory_albums
  FOR UPDATE TO authenticated
  USING (
    created_by_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'memories.manage')
  )
  WITH CHECK (
    created_by_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'memories.manage')
  );

CREATE POLICY "memory_albums_delete_owner_or_manager" ON public.memory_albums
  FOR DELETE TO authenticated
  USING (
    created_by_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'memories.manage')
  );

-- Memory Item Policies
CREATE POLICY "memory_items_select_scoped" ON public.memory_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND famora.is_family_member(family_id)
    AND (
      visibility = 'family'
      OR author_member_id = famora.current_member_id(family_id)
      OR (visibility = 'shared' AND famora.current_member_id(family_id) = ANY(shared_with_member_ids))
      OR (visibility = 'adults_only' AND famora.has_permission(family_id, 'memories.manage'))
    )
  );

CREATE POLICY "memory_items_insert_permitted" ON public.memory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND author_member_id = famora.current_member_id(family_id)
    AND (
      media_type = 'journal'
      OR visibility = 'private'
      OR famora.has_permission(family_id, 'memories.manage')
    )
  );

CREATE POLICY "memory_items_update_owner_or_manager" ON public.memory_items
  FOR UPDATE TO authenticated
  USING (
    author_member_id = famora.current_member_id(family_id)
    OR (visibility <> 'private' AND famora.has_permission(family_id, 'memories.manage'))
  )
  WITH CHECK (
    author_member_id = famora.current_member_id(family_id)
    OR (visibility <> 'private' AND famora.has_permission(family_id, 'memories.manage'))
  );

-- Favorites Policies
CREATE POLICY "memory_favorites_select_member" ON public.memory_favorites
  FOR SELECT TO authenticated
  USING (famora.is_family_member(family_id));

CREATE POLICY "memory_favorites_insert_own" ON public.memory_favorites
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "memory_favorites_delete_own" ON public.memory_favorites
  FOR DELETE TO authenticated
  USING (member_id = famora.current_member_id(family_id));

-- Private Storage Object Policies (path convention: {family_id}/{member_id}/{filename})
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "family_memories_storage_select" ON storage.objects;
      CREATE POLICY "family_memories_storage_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (
          bucket_id = 'family-memories'
          AND famora.is_family_member((storage.foldername(name))[1]::uuid)
        );

      DROP POLICY IF EXISTS "family_memories_storage_insert" ON storage.objects;
      CREATE POLICY "family_memories_storage_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'family-memories'
          AND famora.is_family_member((storage.foldername(name))[1]::uuid)
        );

      DROP POLICY IF EXISTS "family_memories_storage_delete" ON storage.objects;
      CREATE POLICY "family_memories_storage_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'family-memories'
          AND (
            famora.has_permission((storage.foldername(name))[1]::uuid, 'memories.manage')
            OR (storage.foldername(name))[2] = famora.current_member_id((storage.foldername(name))[1]::uuid)::text
          )
        );
    $p$;
  END IF;
END $$;


-- ==========================================
-- 0026_habits_and_safety.sql
-- ==========================================
-- Migration 0026: Habits, Routines & Family Safety (Consent-Based Location Sharing, Emergency Contacts & Procedures)

-- 1. Habits & Routines
CREATE TABLE public.habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  owner_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'family_challenge')),
  category TEXT NOT NULL CHECK (category IN ('reading', 'exercise', 'sleep', 'mindfulness', 'learning', 'routine', 'other')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  cadence TEXT NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily', 'weekly')),
  target_per_period INTEGER NOT NULL DEFAULT 1 CHECK (target_per_period BETWEEN 1 AND 1000),
  target_unit TEXT NOT NULL DEFAULT 'times' CHECK (target_unit IN ('times', 'minutes', 'pages', 'hours')),
  reminder_time TEXT CHECK (reminder_time IS NULL OR reminder_time ~ '^\d{2}:\d{2}$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_habits_family_active ON public.habits(family_id, is_active, created_at DESC);
CREATE TRIGGER trg_habits_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 2. Habit Completion Logs
CREATE TABLE public.habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  value_completed INTEGER NOT NULL DEFAULT 1 CHECK (value_completed BETWEEN 1 AND 10000),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (habit_id, member_id, log_date)
);

CREATE INDEX idx_habit_logs_member_date ON public.habit_logs(family_id, member_id, log_date DESC);
CREATE TRIGGER trg_habit_logs_updated_at
  BEFORE UPDATE ON public.habit_logs
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 3. Emergency & Trusted Contacts
CREATE TABLE public.safety_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('emergency', 'trusted')),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  relationship TEXT NOT NULL DEFAULT '' CHECK (char_length(relationship) <= 80),
  phone TEXT NOT NULL CHECK (char_length(trim(phone)) BETWEEN 3 AND 40),
  email TEXT NOT NULL DEFAULT '' CHECK (char_length(email) <= 120),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 600),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_safety_contacts_family ON public.safety_contacts(family_id, contact_type, is_primary DESC);
CREATE TRIGGER trg_safety_contacts_updated_at
  BEFORE UPDATE ON public.safety_contacts
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Emergency Procedures, Safety Notes & Emergency Info
CREATE TABLE public.safety_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  created_by_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('emergency_info', 'procedure', 'safety_note')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  content TEXT NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_safety_protocols_family ON public.safety_protocols(family_id, category, created_at DESC);
CREATE TRIGGER trg_safety_protocols_updated_at
  BEFORE UPDATE ON public.safety_protocols
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 5. Consensual, Time-Limited Location Sharing (never covert)
CREATE TABLE public.safety_location_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  consent_acknowledged_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  shared_with_member_ids UUID[] NOT NULL DEFAULT '{}',
  status_label TEXT NOT NULL DEFAULT '' CHECK (char_length(status_label) <= 120),
  approximate_area TEXT NOT NULL DEFAULT '' CHECK (char_length(approximate_area) <= 160),
  latitude DOUBLE PRECISION CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  longitude DOUBLE PRECISION CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  last_updated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, member_id),
  CONSTRAINT safety_location_explicit_consent CHECK (
    is_enabled = false
    OR (
      consent_acknowledged_at IS NOT NULL
      AND expires_at IS NOT NULL
      AND revoked_at IS NULL
    )
  )
);

CREATE INDEX idx_safety_location_family ON public.safety_location_shares(family_id, is_enabled);
CREATE TRIGGER trg_safety_location_shares_updated_at
  BEFORE UPDATE ON public.safety_location_shares
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.safety_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.safety_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_protocols FORCE ROW LEVEL SECURITY;
ALTER TABLE public.safety_location_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_location_shares FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.habits, public.habit_logs, public.safety_contacts, public.safety_protocols, public.safety_location_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits, public.habit_logs, public.safety_contacts, public.safety_protocols, public.safety_location_shares TO authenticated;

-- Habits Policies
CREATE POLICY "habits_select_scoped" ON public.habits
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      scope = 'family_challenge'
      OR owner_member_id = famora.current_member_id(family_id)
      OR famora.has_permission(family_id, 'habits.manage_all')
    )
  );

CREATE POLICY "habits_insert_member" ON public.habits
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND (
      (scope = 'personal' AND owner_member_id = famora.current_member_id(family_id))
      OR (scope = 'family_challenge' AND famora.has_permission(family_id, 'habits.manage_all'))
    )
  );

CREATE POLICY "habits_update_owner_or_manager" ON public.habits
  FOR UPDATE TO authenticated
  USING (
    owner_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'habits.manage_all')
  )
  WITH CHECK (
    owner_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'habits.manage_all')
  );

-- Habit Logs Policies
CREATE POLICY "habit_logs_select_scoped" ON public.habit_logs
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      member_id = famora.current_member_id(family_id)
      OR famora.has_permission(family_id, 'habits.manage_all')
      OR EXISTS (
        SELECT 1 FROM public.habits h
        WHERE h.id = habit_id AND h.scope = 'family_challenge'
      )
    )
  );

CREATE POLICY "habit_logs_insert_own" ON public.habit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "habit_logs_update_own" ON public.habit_logs
  FOR UPDATE TO authenticated
  USING (member_id = famora.current_member_id(family_id))
  WITH CHECK (member_id = famora.current_member_id(family_id));

-- Safety Contacts & Protocols Policies (strict: requires SOS or Safety Manage permission to view; Manage permission to write)
CREATE POLICY "safety_contacts_select_permitted" ON public.safety_contacts
  FOR SELECT TO authenticated
  USING (
    famora.has_permission(family_id, 'safety.sos.trigger')
    OR famora.has_permission(family_id, 'safety.contacts_medical.manage')
  );

CREATE POLICY "safety_contacts_write_manager" ON public.safety_contacts
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'safety.contacts_medical.manage'))
  WITH CHECK (famora.has_permission(family_id, 'safety.contacts_medical.manage'));

CREATE POLICY "safety_protocols_select_permitted" ON public.safety_protocols
  FOR SELECT TO authenticated
  USING (
    famora.has_permission(family_id, 'safety.sos.trigger')
    OR famora.has_permission(family_id, 'safety.contacts_medical.manage')
  );

CREATE POLICY "safety_protocols_write_manager" ON public.safety_protocols
  FOR ALL TO authenticated
  USING (famora.has_permission(family_id, 'safety.contacts_medical.manage'))
  WITH CHECK (famora.has_permission(family_id, 'safety.contacts_medical.manage'));

-- Location Sharing Policies (strictly self-owned writes, participant-only + active + unexpired reads)
CREATE POLICY "safety_location_select_consented" ON public.safety_location_shares
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND (
      member_id = famora.current_member_id(family_id)
      OR (
        is_enabled = true
        AND revoked_at IS NULL
        AND consent_acknowledged_at IS NOT NULL
        AND expires_at > now()
        AND famora.current_member_id(family_id) = ANY(shared_with_member_ids)
      )
    )
  );

CREATE POLICY "safety_location_insert_self" ON public.safety_location_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.is_family_member(family_id)
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "safety_location_update_self" ON public.safety_location_shares
  FOR UPDATE TO authenticated
  USING (member_id = famora.current_member_id(family_id))
  WITH CHECK (member_id = famora.current_member_id(family_id));


-- ==========================================
-- 0027_notification_system.sql
-- ==========================================
-- Migration 0027: Notification System (Outbox Pattern, Delivery Logs, Idempotency, Web Push)

-- 1. Extend existing notifications table with category, idempotency_key, and push_status
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'activity'
    CHECK (category IN (
      'invitation',
      'announcement',
      'calendar',
      'task_assignment',
      'task_deadline',
      'shopping',
      'bill_reminder',
      'document_expiration',
      'chat',
      'activity'
    )),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS push_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (push_status IN ('pending', 'sent', 'suppressed_quiet_hours', 'suppressed_preference', 'failed', 'skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_idempotency
  ON public.notifications(recipient_member_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Extend member_preferences with per-category disabled list
ALTER TABLE public.member_preferences
  ADD COLUMN IF NOT EXISTS disabled_categories TEXT[] NOT NULL DEFAULT '{}';

-- 3. Notification Outbox (reliable delivery, deduplication, retry tracking)
CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'push')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, channel)
);

CREATE INDEX idx_notification_outbox_pending ON public.notification_outbox(status, next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_notification_outbox_recipient ON public.notification_outbox(recipient_member_id, created_at DESC);
CREATE TRIGGER trg_notification_outbox_updated_at
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- 4. Delivery & Failure Logs per device
CREATE TABLE public.notification_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  outbox_id UUID NOT NULL REFERENCES public.notification_outbox(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.user_devices(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'expired_subscription', 'suppressed')),
  http_status INTEGER,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_delivery_logs_outbox ON public.notification_delivery_logs(outbox_id, created_at DESC);
CREATE TRIGGER trg_notification_delivery_logs_updated_at
  BEFORE UPDATE ON public.notification_delivery_logs
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_outbox, public.notification_delivery_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_outbox TO authenticated;
GRANT SELECT, INSERT ON public.notification_delivery_logs TO authenticated;

CREATE POLICY "notification_outbox_select_recipient" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (
    recipient_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'workspace.settings.manage')
  );

CREATE POLICY "notification_outbox_insert_member" ON public.notification_outbox
  FOR INSERT TO authenticated
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "notification_outbox_update_recipient_or_admin" ON public.notification_outbox
  FOR UPDATE TO authenticated
  USING (
    recipient_member_id = famora.current_member_id(family_id)
    OR famora.has_permission(family_id, 'workspace.settings.manage')
  )
  WITH CHECK (famora.is_family_member(family_id));

CREATE POLICY "notification_delivery_logs_select_member" ON public.notification_delivery_logs
  FOR SELECT TO authenticated
  USING (
    famora.is_family_member(family_id)
    AND EXISTS (
      SELECT 1 FROM public.notification_outbox o
      WHERE o.id = outbox_id
        AND (
          o.recipient_member_id = famora.current_member_id(family_id)
          OR famora.has_permission(family_id, 'workspace.settings.manage')
        )
    )
  );

CREATE POLICY "notification_delivery_logs_insert_member" ON public.notification_delivery_logs
  FOR INSERT TO authenticated
  WITH CHECK (famora.is_family_member(family_id));


-- ==========================================
-- 0028_ai_assistant.sql
-- ==========================================
-- Migration 0028: Famora AI Family Assistant (Conversations, Messages, Usage Tracking, Rate Limiting)

CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conversations_member ON public.ai_conversations(family_id, member_id, updated_at DESC);
CREATE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1 AND char_length(content) <= 12000),
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_action JSONB,
  action_status TEXT NOT NULL DEFAULT 'none' CHECK (action_status IN ('none', 'pending_confirmation', 'confirmed', 'cancelled')),
  provider_name TEXT NOT NULL DEFAULT 'famora_local',
  model_name TEXT NOT NULL DEFAULT 'context_engine_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_conv ON public.ai_messages(conversation_id, created_at ASC);
CREATE TRIGGER trg_ai_messages_updated_at
  BEFORE UPDATE ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  status TEXT NOT NULL CHECK (status IN ('ok', 'rate_limited', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_member_time ON public.ai_usage_logs(family_id, member_id, created_at DESC);
CREATE TRIGGER trg_ai_usage_logs_updated_at
  BEFORE UPDATE ON public.ai_usage_logs
  FOR EACH ROW EXECUTE FUNCTION famora.set_updated_at();

-- Enable & Force RLS + Explicit Privileges
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_conversations, public.ai_messages, public.ai_usage_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations, public.ai_messages TO authenticated;
GRANT SELECT, INSERT ON public.ai_usage_logs TO authenticated;

CREATE POLICY "ai_conversations_owner_only" ON public.ai_conversations
  FOR ALL TO authenticated
  USING (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  )
  WITH CHECK (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "ai_messages_owner_only" ON public.ai_messages
  FOR ALL TO authenticated
  USING (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  )
  WITH CHECK (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "ai_usage_logs_owner_only" ON public.ai_usage_logs
  FOR SELECT TO authenticated
  USING (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  );

CREATE POLICY "ai_usage_logs_insert_self" ON public.ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    famora.has_permission(family_id, 'ai.assistant.use')
    AND member_id = famora.current_member_id(family_id)
  );


-- ==========================================
-- 0029_public_rpc_wrappers.sql
-- ==========================================
-- Migration 0029: Public Schema RPC Wrappers for PostgREST Exposure
-- Exposes famora.* RPC functions via public.* wrappers (SECURITY INVOKER)
-- so supabase.rpc('<name>', ...) works with PostgREST's default public schema.

CREATE OR REPLACE FUNCTION public.create_family_with_owner(
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_timezone TEXT DEFAULT 'UTC',
  p_currency_code TEXT DEFAULT 'USD',
  p_avatar_path TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.create_family_with_owner(p_name, p_description, p_timezone, p_currency_code, p_avatar_path);
$$;

CREATE OR REPLACE FUNCTION public.get_my_family_permissions(p_family_id UUID)
RETURNS TABLE (permission_key TEXT)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT permission_key FROM famora.get_my_family_permissions(p_family_id);
$$;

CREATE OR REPLACE FUNCTION public.set_member_permission_override(
  p_family_id UUID,
  p_target_member_id UUID,
  p_permission_key TEXT,
  p_effect TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.set_member_permission_override(p_family_id, p_target_member_id, p_permission_key, p_effect);
$$;

CREATE OR REPLACE FUNCTION public.accept_family_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.accept_family_invitation(p_token);
$$;

CREATE OR REPLACE FUNCTION public.reject_family_invitation(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.reject_family_invitation(p_token);
$$;

CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token TEXT)
RETURNS TABLE (
  invitation_id UUID,
  family_id UUID,
  family_name TEXT,
  role_key TEXT,
  role_display_name TEXT,
  invited_email TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT * FROM famora.get_invitation_preview(p_token);
$$;

CREATE OR REPLACE FUNCTION public.transfer_family_ownership(
  p_family_id UUID,
  p_target_member_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.transfer_family_ownership(p_family_id, p_target_member_id);
$$;

CREATE OR REPLACE FUNCTION public.approve_chore_submission(
  p_submission_id UUID,
  p_approved BOOLEAN,
  p_note TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.approve_chore_submission(p_submission_id, p_approved, p_note);
$$;

CREATE OR REPLACE FUNCTION public.redeem_family_reward(
  p_family_id UUID,
  p_reward_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.redeem_family_reward(p_family_id, p_reward_id);
$$;

CREATE OR REPLACE FUNCTION public.cast_poll_vote(
  p_poll_id UUID,
  p_option_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.cast_poll_vote(p_poll_id, p_option_ids);
$$;

CREATE OR REPLACE FUNCTION public.get_poll_vote_counts(p_family_id UUID)
RETURNS TABLE (
  poll_id UUID,
  option_id UUID,
  vote_count INTEGER
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT * FROM famora.get_poll_vote_counts(p_family_id);
$$;

CREATE OR REPLACE FUNCTION public.record_finance_transaction(
  p_family_id UUID,
  p_account_id UUID,
  p_kind TEXT,
  p_amount NUMERIC(18, 2),
  p_merchant TEXT,
  p_category TEXT,
  p_occurred_on DATE,
  p_notes TEXT DEFAULT '',
  p_transfer_account_id UUID DEFAULT NULL,
  p_attachment_name TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.record_finance_transaction(
    p_family_id, p_account_id, p_kind, p_amount, p_merchant, p_category,
    p_occurred_on, p_notes, p_transfer_account_id, p_attachment_name, p_idempotency_key
  );
$$;

CREATE OR REPLACE FUNCTION public.reverse_finance_transaction(
  p_family_id UUID,
  p_transaction_id UUID,
  p_reason TEXT DEFAULT 'Manual reversal'
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.reverse_finance_transaction(p_family_id, p_transaction_id, p_reason);
$$;

CREATE OR REPLACE FUNCTION public.pay_household_bill(
  p_family_id UUID,
  p_bill_id UUID,
  p_account_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.pay_household_bill(p_family_id, p_bill_id, p_account_id, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.process_due_recurring_schedules(
  p_family_id UUID,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.process_due_recurring_schedules(p_family_id, p_as_of_date);
$$;

CREATE OR REPLACE FUNCTION public.contribute_to_finance_goal(
  p_family_id UUID,
  p_goal_id UUID,
  p_amount NUMERIC(18, 2),
  p_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.contribute_to_finance_goal(p_family_id, p_goal_id, p_amount, p_notes);
$$;

CREATE OR REPLACE FUNCTION public.record_debt_payment(
  p_family_id UUID,
  p_debt_id UUID,
  p_amount NUMERIC(18, 2),
  p_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.record_debt_payment(p_family_id, p_debt_id, p_amount, p_notes);
$$;

-- Restrictive privileges: revoke from PUBLIC & anon, grant execute to authenticated
REVOKE ALL ON FUNCTION public.create_family_with_owner(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_family_with_owner(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_family_permissions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_family_permissions(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.set_member_permission_override(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_permission_override(UUID, UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_family_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_family_invitation(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_family_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_family_invitation(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_invitation_preview(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_preview(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_family_ownership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_family_ownership(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_chore_submission(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_chore_submission(UUID, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_family_reward(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_family_reward(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.cast_poll_vote(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(UUID, UUID[]) TO authenticated;

REVOKE ALL ON FUNCTION public.get_poll_vote_counts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_poll_vote_counts(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.record_finance_transaction(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_finance_transaction(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_finance_transaction(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_finance_transaction(UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.pay_household_bill(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_household_bill(UUID, UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.process_due_recurring_schedules(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_due_recurring_schedules(UUID, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.contribute_to_finance_goal(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contribute_to_finance_goal(UUID, UUID, NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_debt_payment(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- Refresh PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
