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
