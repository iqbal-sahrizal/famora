-- Migration 0010: Member Management, Invitation Reject/Preview, and Ownership Transfer RPCs

-- 1. Allow 'rejected' status on family_invitations
ALTER TABLE public.family_invitations
  DROP CONSTRAINT IF EXISTS family_invitations_status_check;

ALTER TABLE public.family_invitations
  ADD CONSTRAINT family_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked', 'expired'));

-- 2. Preview an invitation safely for an authenticated recipient without exposing raw table
CREATE OR REPLACE FUNCTION famora.get_invitation_preview(p_token TEXT)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_hash TEXT;
BEGIN
  IF auth.uid() IS NULL OR p_token IS NULL OR char_length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  RETURN QUERY
  SELECT
    fi.id,
    fi.family_id,
    f.name,
    fr.role_key,
    fr.display_name,
    fi.email,
    fi.status,
    fi.expires_at
  FROM public.family_invitations fi
  JOIN public.families f ON f.id = fi.family_id
  JOIN public.family_roles fr ON fr.id = fi.role_id
  WHERE fi.token_hash = v_token_hash
    AND f.deleted_at IS NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION famora.get_invitation_preview(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.get_invitation_preview(TEXT) TO authenticated;

-- 3. Reject an invitation safely (verifies recipient email and prevents token reuse)
CREATE OR REPLACE FUNCTION famora.reject_family_invitation(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_email TEXT;
  v_token_hash TEXT;
  v_inv RECORD;
BEGIN
  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF auth.uid() IS NULL OR v_user_email = '' THEN
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

  UPDATE public.family_invitations
  SET status = 'rejected'
  WHERE id = v_inv.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.reject_family_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.reject_family_invitation(TEXT) TO authenticated;

-- 4. Atomic Family Ownership Transfer (Owner -> Active Adult/Admin Member)
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

  SELECT * INTO v_target
  FROM public.family_members
  WHERE id = p_target_member_id
    AND family_id = p_family_id
    AND status = 'active'
    AND is_managed_child = false
    AND user_id IS NOT NULL
  FOR UPDATE;

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
    'family.ownership_transferred',
    'family_members',
    p_target_member_id,
    jsonb_build_object('previous_owner_member_id', v_caller_member_id, 'new_owner_member_id', p_target_member_id)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION famora.transfer_family_ownership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.transfer_family_ownership(UUID, UUID) TO authenticated;
