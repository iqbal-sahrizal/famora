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
