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
