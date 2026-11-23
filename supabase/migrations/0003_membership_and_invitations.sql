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
