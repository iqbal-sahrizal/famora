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
