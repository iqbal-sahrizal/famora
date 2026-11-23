  -- Migration 0029: Public Schema RPC Wrappers for PostgREST Exposure
  -- Exposes famora.* RPC functions via public.* wrappers (SECURITY INVOKER)
  -- so supabase.rpc('<name>', ...) works with PostgREST's default public schema.

  CREATE OR REPLACE FUNCTION public.create_family_with_owner(
    p_name TEXT,
    p_description TEXT DEFAULT '',
    p_timezone TEXT DEFAULT 'UTC',
    p_currency_code TEXT DEFAULT 'USD',
    p_avatar_path TEXT DEFAULT NULL
  )
  RETURNS UUID
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.create_family_with_owner(p_name, p_description, p_timezone, p_currency_code, p_avatar_path);
  $$;

  CREATE OR REPLACE FUNCTION public.get_my_family_permissions(p_family_id UUID)
  RETURNS TABLE (permission_key TEXT)
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT permission_key FROM famora.get_my_family_permissions(p_family_id);
  $$;

  CREATE OR REPLACE FUNCTION public.set_member_permission_override(
    p_family_id UUID,
    p_target_member_id UUID,
    p_permission_key TEXT,
    p_effect TEXT
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.set_member_permission_override(p_family_id, p_target_member_id, p_permission_key, p_effect);
  $$;

  CREATE OR REPLACE FUNCTION public.accept_family_invitation(p_token TEXT)
  RETURNS UUID
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.accept_family_invitation(p_token);
  $$;

  CREATE OR REPLACE FUNCTION public.reject_family_invitation(p_token TEXT)
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.reject_family_invitation(p_token);
  $$;

  CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token TEXT)
  RETURNS TABLE (
    invitation_id UUID,
    family_id UUID,
    family_name TEXT,
    role_key TEXT,
    role_display_name TEXT,
    invited_email TEXT,
    status TEXT,
    expires_at TIMESTAMPTZ
  )
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT * FROM famora.get_invitation_preview(p_token);
  $$;

  CREATE OR REPLACE FUNCTION public.transfer_family_ownership(
    p_family_id UUID,
    p_target_member_id UUID
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.transfer_family_ownership(p_family_id, p_target_member_id);
  $$;

  CREATE OR REPLACE FUNCTION public.approve_chore_submission(
    p_submission_id UUID,
    p_approved BOOLEAN,
    p_note TEXT DEFAULT ''
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.approve_chore_submission(p_submission_id, p_approved, p_note);
  $$;

  CREATE OR REPLACE FUNCTION public.redeem_family_reward(
    p_family_id UUID,
    p_reward_id UUID
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.redeem_family_reward(p_family_id, p_reward_id);
  $$;

  CREATE OR REPLACE FUNCTION public.cast_poll_vote(
    p_poll_id UUID,
    p_option_ids UUID[]
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.cast_poll_vote(p_poll_id, p_option_ids);
  $$;

  CREATE OR REPLACE FUNCTION public.get_poll_vote_counts(p_family_id UUID)
  RETURNS TABLE (
    poll_id UUID,
    option_id UUID,
    vote_count INTEGER
  )
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT * FROM famora.get_poll_vote_counts(p_family_id);
  $$;

  CREATE OR REPLACE FUNCTION public.record_finance_transaction(
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
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.record_finance_transaction(
      p_family_id, p_account_id, p_kind, p_amount, p_merchant, p_category,
      p_occurred_on, p_notes, p_transfer_account_id, p_attachment_name, p_idempotency_key
    );
  $$;

  CREATE OR REPLACE FUNCTION public.reverse_finance_transaction(
    p_family_id UUID,
    p_transaction_id UUID,
    p_reason TEXT DEFAULT 'Manual reversal'
  )
  RETURNS UUID
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.reverse_finance_transaction(p_family_id, p_transaction_id, p_reason);
  $$;

  CREATE OR REPLACE FUNCTION public.pay_household_bill(
    p_family_id UUID,
    p_bill_id UUID,
    p_account_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
  )
  RETURNS UUID
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.pay_household_bill(p_family_id, p_bill_id, p_account_id, p_idempotency_key);
  $$;

  CREATE OR REPLACE FUNCTION public.process_due_recurring_schedules(
    p_family_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
  )
  RETURNS INTEGER
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.process_due_recurring_schedules(p_family_id, p_as_of_date);
  $$;

  CREATE OR REPLACE FUNCTION public.contribute_to_finance_goal(
    p_family_id UUID,
    p_goal_id UUID,
    p_amount NUMERIC(18, 2),
    p_notes TEXT DEFAULT ''
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.contribute_to_finance_goal(p_family_id, p_goal_id, p_amount, p_notes);
  $$;

  CREATE OR REPLACE FUNCTION public.record_debt_payment(
    p_family_id UUID,
    p_debt_id UUID,
    p_amount NUMERIC(18, 2),
    p_notes TEXT DEFAULT ''
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path = public, famora, pg_temp
  AS $$
    SELECT famora.record_debt_payment(p_family_id, p_debt_id, p_amount, p_notes);
  $$;

  -- Restrictive privileges: revoke from PUBLIC & anon, grant execute to authenticated
  REVOKE ALL ON FUNCTION public.create_family_with_owner(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.create_family_with_owner(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.get_my_family_permissions(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_my_family_permissions(UUID) TO authenticated;

  REVOKE ALL ON FUNCTION public.set_member_permission_override(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.set_member_permission_override(UUID, UUID, TEXT, TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.accept_family_invitation(TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.accept_family_invitation(TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.reject_family_invitation(TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.reject_family_invitation(TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.get_invitation_preview(TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_invitation_preview(TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.transfer_family_ownership(UUID, UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.transfer_family_ownership(UUID, UUID) TO authenticated;

  REVOKE ALL ON FUNCTION public.approve_chore_submission(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.approve_chore_submission(UUID, BOOLEAN, TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.redeem_family_reward(UUID, UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.redeem_family_reward(UUID, UUID) TO authenticated;

  REVOKE ALL ON FUNCTION public.cast_poll_vote(UUID, UUID[]) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.cast_poll_vote(UUID, UUID[]) TO authenticated;

  REVOKE ALL ON FUNCTION public.get_poll_vote_counts(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_poll_vote_counts(UUID) TO authenticated;

  REVOKE ALL ON FUNCTION public.record_finance_transaction(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.record_finance_transaction(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, UUID, TEXT, TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.reverse_finance_transaction(UUID, UUID, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.reverse_finance_transaction(UUID, UUID, TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.pay_household_bill(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.pay_household_bill(UUID, UUID, UUID, TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.process_due_recurring_schedules(UUID, DATE) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.process_due_recurring_schedules(UUID, DATE) TO authenticated;

  REVOKE ALL ON FUNCTION public.contribute_to_finance_goal(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.contribute_to_finance_goal(UUID, UUID, NUMERIC, TEXT) TO authenticated;

  REVOKE ALL ON FUNCTION public.record_debt_payment(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.record_debt_payment(UUID, UUID, NUMERIC, TEXT) TO authenticated;

  -- Refresh PostgREST schema cache immediately
  NOTIFY pgrst, 'reload schema';
