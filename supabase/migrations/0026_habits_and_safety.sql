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
