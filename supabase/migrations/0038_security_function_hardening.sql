-- Migration 0038: Security, Concurrency & Financial Integrity Function Hardening (R6.5)
-- Forward-only migration fixing confirmed findings F-01 through F-09 without altering historical migrations.

-- F-06: Pin pg_temp in famora.is_chat_participant (0024)
ALTER FUNCTION famora.is_chat_participant(UUID)
  SET search_path = public, famora, pg_temp;

-- F-01: Prevent reward double-spend race in famora.redeem_family_reward (0015)
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

  PERFORM id FROM public.family_members WHERE id = v_caller_member_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtext('reward_redeem:' || v_caller_member_id::text));

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

-- F-04: Serialize per-(poll, member) voting in famora.cast_poll_vote (0017)
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

  SELECT * INTO v_poll FROM public.family_polls WHERE id = p_poll_id FOR SHARE;
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

  PERFORM pg_advisory_xact_lock(hashtext('poll_vote:' || p_poll_id::text || ':' || v_member_id::text));

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

-- F-03: Personal dst check, sorted account locks, & archived guard in famora.record_finance_transaction (0018)
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
  v_lock_id UUID;
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
    PERFORM pg_advisory_xact_lock(hashtext('fin_idem:' || p_family_id::text || ':' || p_idempotency_key));
    SELECT id INTO v_existing_id
    FROM public.finance_transactions
    WHERE family_id = p_family_id AND idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  v_member_id := famora.current_member_id(p_family_id);

  IF p_kind = 'transfer' THEN
    IF p_transfer_account_id IS NULL OR p_transfer_account_id = p_account_id THEN
      RAISE EXCEPTION 'Transfer requires a different destination account' USING ERRCODE = '22023';
    END IF;
    FOR v_lock_id IN
      SELECT id FROM public.finance_accounts
      WHERE family_id = p_family_id AND id IN (p_account_id, p_transfer_account_id)
      ORDER BY id
      FOR UPDATE
    LOOP
    END LOOP;
  END IF;

  SELECT * INTO v_src
  FROM public.finance_accounts
  WHERE id = p_account_id AND family_id = p_family_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source account not found' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_src.is_archived, false) THEN
    RAISE EXCEPTION 'Source account is archived' USING ERRCODE = '22023';
  END IF;

  IF v_src.ownership_scope = 'personal' AND v_src.owner_member_id <> v_member_id THEN
    RAISE EXCEPTION 'Not authorized to access this personal account' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'transfer' THEN
    SELECT * INTO v_dst
    FROM public.finance_accounts
    WHERE id = p_transfer_account_id AND family_id = p_family_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Destination account not found' USING ERRCODE = 'P0002';
    END IF;

    IF coalesce(v_dst.is_archived, false) THEN
      RAISE EXCEPTION 'Destination account is archived' USING ERRCODE = '22023';
    END IF;

    IF v_dst.ownership_scope = 'personal' AND v_dst.owner_member_id <> v_member_id THEN
      RAISE EXCEPTION 'Not authorized to access destination personal account' USING ERRCODE = '42501';
    END IF;

    UPDATE public.finance_accounts SET balance_numeric = balance_numeric - p_amount WHERE id = v_src.id;
    UPDATE public.finance_accounts SET balance_numeric = balance_numeric + p_amount WHERE id = v_dst.id;
  ELSIF p_kind = 'income' THEN
    UPDATE public.finance_accounts SET balance_numeric = balance_numeric + p_amount WHERE id = v_src.id;
  ELSE
    UPDATE public.finance_accounts SET balance_numeric = balance_numeric - p_amount WHERE id = v_src.id;
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

-- F-02: Personal-account ownership & FOR UPDATE account locks in famora.reverse_finance_transaction (0018)
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
  v_acc RECORD;
  v_dst RECORD;
  v_reversal_id UUID;
  v_lock_id UUID;
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

  FOR v_lock_id IN
    SELECT id FROM public.finance_accounts
    WHERE family_id = p_family_id
      AND id IN (v_tx.account_id, coalesce(v_tx.transfer_account_id, v_tx.account_id))
    ORDER BY id
    FOR UPDATE
  LOOP
  END LOOP;

  SELECT * INTO v_acc FROM public.finance_accounts WHERE id = v_tx.account_id AND family_id = p_family_id;
  IF v_acc.ownership_scope = 'personal' AND v_acc.owner_member_id <> v_member_id THEN
    RAISE EXCEPTION 'Not authorized to reverse transaction on another member personal account' USING ERRCODE = '42501';
  END IF;

  IF v_tx.kind = 'transfer' AND v_tx.transfer_account_id IS NOT NULL THEN
    SELECT * INTO v_dst FROM public.finance_accounts WHERE id = v_tx.transfer_account_id AND family_id = p_family_id;
    IF v_dst.ownership_scope = 'personal' AND v_dst.owner_member_id <> v_member_id THEN
      RAISE EXCEPTION 'Not authorized to reverse transfer on another member personal account' USING ERRCODE = '42501';
    END IF;
  END IF;

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

-- F-05: Prevent overpayment / settled-debt double entry in famora.record_debt_payment (0020)
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

  IF v_debt.status = 'settled' OR v_debt.remaining_numeric <= 0 THEN
    RAISE EXCEPTION 'Debt/receivable is already settled' USING ERRCODE = '22023';
  END IF;

  IF p_amount > v_debt.remaining_numeric THEN
    RAISE EXCEPTION 'Payment exceeds remaining balance' USING ERRCODE = '22023';
  END IF;

  v_next_remaining := v_debt.remaining_numeric - p_amount;

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

-- F-07: Restrict sensitive permission overrides to owner in famora.set_member_permission_override (0011)
CREATE OR REPLACE FUNCTION famora.set_member_permission_override(
  p_family_id UUID,
  p_target_member_id UUID,
  p_permission_key TEXT,
  p_effect TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_member_id UUID;
  v_caller_role_key TEXT;
  v_permission_id UUID;
  v_target_role_key TEXT;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_target_member_id IS NULL THEN
    RAISE EXCEPTION 'Invalid permission override parameters' USING ERRCODE = '22023';
  END IF;

  IF p_effect NOT IN ('allow', 'deny', 'inherit') THEN
    RAISE EXCEPTION 'Invalid override effect: %', p_effect USING ERRCODE = '22023';
  END IF;

  IF NOT famora.has_permission(p_family_id, 'family.members.invite_manage') THEN
    RAISE EXCEPTION 'Insufficient privileges to manage member permissions' USING ERRCODE = '42501';
  END IF;

  v_caller_member_id := famora.current_member_id(p_family_id);
  v_caller_role_key := famora.member_role_key(p_family_id);
  IF v_caller_member_id = p_target_member_id THEN
    RAISE EXCEPTION 'Users cannot modify their own permission overrides' USING ERRCODE = '42501';
  END IF;

  SELECT fr.role_key INTO v_target_role_key
  FROM public.family_members fm
  JOIN public.family_roles fr ON fr.id = fm.role_id
  WHERE fm.id = p_target_member_id AND fm.family_id = p_family_id;

  IF v_target_role_key IS NULL THEN
    RAISE EXCEPTION 'Target member not found in family' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_role_key = 'owner' THEN
    RAISE EXCEPTION 'Owner permissions cannot be restricted via overrides' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role_key <> 'owner' AND (
    p_permission_key IN ('family.delete', 'family.members.invite_manage')
    OR v_target_role_key = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only family owner can modify admin or governance permission overrides' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_permission_id
  FROM public.permissions
  WHERE permission_key = p_permission_key;

  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'Unknown permission key: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF p_effect = 'inherit' THEN
    DELETE FROM public.member_permission_overrides
    WHERE family_id = p_family_id
      AND member_id = p_target_member_id
      AND permission_id = v_permission_id;
  ELSE
    INSERT INTO public.member_permission_overrides (
      family_id, member_id, permission_id, effect, granted_by_member_id
    )
    VALUES (
      p_family_id, p_target_member_id, v_permission_id, p_effect, v_caller_member_id
    )
    ON CONFLICT (member_id, permission_id)
    DO UPDATE SET
      effect = EXCLUDED.effect,
      granted_by_member_id = EXCLUDED.granted_by_member_id,
      updated_at = now();
  END IF;

  RETURN true;
END;
$$;

-- F-08: Lock caller and target in sorted UUID order in famora.transfer_family_ownership (0010)
CREATE OR REPLACE FUNCTION famora.transfer_family_ownership(
  p_family_id UUID,
  p_target_member_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_member_id UUID;
  v_caller_role_key TEXT;
  v_owner_role_id UUID;
  v_admin_role_id UUID;
  v_target RECORD;
  v_lock_id UUID;
BEGIN
  IF auth.uid() IS NULL OR p_family_id IS NULL OR p_target_member_id IS NULL THEN
    RAISE EXCEPTION 'Invalid ownership transfer parameters' USING ERRCODE = '22023';
  END IF;

  v_caller_member_id := famora.current_member_id(p_family_id);
  v_caller_role_key := famora.member_role_key(p_family_id);

  IF v_caller_member_id IS NULL OR v_caller_role_key <> 'owner' THEN
    RAISE EXCEPTION 'Only the current family owner can transfer ownership' USING ERRCODE = '42501';
  END IF;

  IF v_caller_member_id = p_target_member_id THEN
    RAISE EXCEPTION 'Target member is already the owner' USING ERRCODE = '22023';
  END IF;

  FOR v_lock_id IN
    SELECT id FROM public.family_members
    WHERE family_id = p_family_id AND id IN (v_caller_member_id, p_target_member_id)
    ORDER BY id
    FOR UPDATE
  LOOP
  END LOOP;

  SELECT * INTO v_target
  FROM public.family_members
  WHERE id = p_target_member_id
    AND family_id = p_family_id
    AND status = 'active'
    AND is_managed_child = false
    AND user_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target member must be an active non-managed adult account' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.family_roles WHERE role_key = 'owner' AND family_id IS NULL LIMIT 1;
  SELECT id INTO v_admin_role_id FROM public.family_roles WHERE role_key = 'admin' AND family_id IS NULL LIMIT 1;

  UPDATE public.family_members SET role_id = v_owner_role_id WHERE id = p_target_member_id;
  UPDATE public.family_members SET role_id = v_admin_role_id WHERE id = v_caller_member_id;

  INSERT INTO public.activity_logs (family_id, actor_member_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_family_id,
    v_caller_member_id,
    'ownership.transferred',
    'family_members',
    p_target_member_id,
    jsonb_build_object('previous_owner_member_id', v_caller_member_id, 'new_owner_member_id', p_target_member_id)
  );

  RETURN true;
END;
$$;

-- F-09: Guard duplicate active membership in famora.accept_family_invitation (0007)
CREATE OR REPLACE FUNCTION famora.accept_family_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_token_hash TEXT;
  v_inv RECORD;
  v_member_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_user_id IS NULL OR v_user_email = '' THEN
    RAISE EXCEPTION 'Authentication with verified email is required' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR char_length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = '22023';
  END IF;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv
  FROM public.family_invitations
  WHERE token_hash = v_token_hash
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0002';
  END IF;

  IF lower(v_inv.email) <> v_user_email THEN
    RAISE EXCEPTION 'Invitation email does not match authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_member_id
  FROM public.family_members
  WHERE family_id = v_inv.family_id
    AND user_id = v_user_id
    AND status = 'active'
  LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    UPDATE public.family_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_inv.id;
    RETURN v_member_id;
  END IF;

  INSERT INTO public.family_members (family_id, user_id, role_id, display_name, is_managed_child, status)
  VALUES (
    v_inv.family_id,
    v_user_id,
    v_inv.role_id,
    split_part(v_user_email, '@', 1),
    false,
    'active'
  )
  RETURNING id INTO v_member_id;

  UPDATE public.family_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_inv.id;

  INSERT INTO public.activity_logs (family_id, actor_member_id, action, resource_type, resource_id, metadata)
  VALUES (
    v_inv.family_id,
    v_member_id,
    'invitation.accepted',
    'family_invitations',
    v_inv.id,
    jsonb_build_object('role_id', v_inv.role_id)
  );

  RETURN v_member_id;
END;
$$;
