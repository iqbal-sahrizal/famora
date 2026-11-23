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
