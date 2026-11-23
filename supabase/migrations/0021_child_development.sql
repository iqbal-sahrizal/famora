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
