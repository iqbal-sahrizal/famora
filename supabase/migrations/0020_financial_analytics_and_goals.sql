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
