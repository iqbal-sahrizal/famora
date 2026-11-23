-- Migration 0035: Fix Delete Family Workspace RPC Dependency Order & Table Name
-- Fixes:
-- 1. public.debt_payments -> public.finance_debt_payments (0020)
-- 2. Deletes public.bill_payment_history before public.finance_transactions (ON DELETE RESTRICT in 0019)
-- 3. Deletes public.finance_goal_contributions and clears self-referential reversed_transaction_id before finance_transactions
-- 4. Revokes execute from anon on both famora.* and public.* functions

CREATE OR REPLACE FUNCTION famora.delete_family_workspace(
  p_family_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, famora, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_owner BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'family.delete') THEN
    RAISE EXCEPTION 'Only the family owner can delete a family workspace'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.family_members fm
    JOIN public.family_roles fr ON fr.id = fm.role_id
    WHERE fm.family_id = p_family_id
      AND fm.user_id = v_user_id
      AND fm.status = 'active'
      AND fr.role_key = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Active family owner membership required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.families WHERE id = p_family_id) THEN
    RAISE EXCEPTION 'Family workspace not found';
  END IF;

  -- Clear finance child/ledger tables in dependency order so ON DELETE RESTRICT FKs do not block cascade
  DELETE FROM public.finance_debt_payments WHERE family_id = p_family_id;
  DELETE FROM public.finance_goal_contributions WHERE family_id = p_family_id;
  DELETE FROM public.bill_payment_history WHERE family_id = p_family_id;

  -- Break self-referential reversal links before deleting finance_transactions
  UPDATE public.finance_transactions
  SET reversed_transaction_id = NULL
  WHERE family_id = p_family_id
    AND reversed_transaction_id IS NOT NULL;

  DELETE FROM public.finance_transactions WHERE family_id = p_family_id;
  DELETE FROM public.finance_accounts WHERE family_id = p_family_id;

  -- Delete family row (cascades all remaining family-scoped tables)
  DELETE FROM public.families WHERE id = p_family_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.delete_family_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.delete_family_workspace(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_family_workspace(
  p_family_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, famora, pg_temp
AS $$
  SELECT famora.delete_family_workspace(p_family_id);
$$;

REVOKE ALL ON FUNCTION public.delete_family_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_family_workspace(UUID) TO authenticated;
