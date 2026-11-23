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
