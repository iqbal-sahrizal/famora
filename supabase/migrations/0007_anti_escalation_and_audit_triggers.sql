-- Migration 0007: Anti-Escalation Guards, Secure Invitation Acceptance, and Audit Triggers

-- 1. Prevent unauthorized role/status escalation on family_members
CREATE OR REPLACE FUNCTION famora.guard_family_member_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_manage BOOLEAN;
  v_old_role_key TEXT;
  v_new_role_key TEXT;
  v_caller_role_key TEXT;
BEGIN
  -- Allow internal/service-role migrations or triggers when auth.uid() is NULL
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_can_manage := famora.has_permission(OLD.family_id, 'family.members.invite_manage');
  v_caller_role_key := famora.member_role_key(OLD.family_id);

  -- Non-managers updating themselves may ONLY change display_name
  IF NOT v_can_manage THEN
    IF NEW.role_id IS DISTINCT FROM OLD.role_id
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.family_id IS DISTINCT FROM OLD.family_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.is_managed_child IS DISTINCT FROM OLD.is_managed_child
      OR NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at THEN
      RAISE EXCEPTION 'Insufficient privileges to modify membership role or status'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Even managers cannot promote someone to owner or demote an owner unless caller is owner
  SELECT role_key INTO v_old_role_key FROM public.family_roles WHERE id = OLD.role_id;
  SELECT role_key INTO v_new_role_key FROM public.family_roles WHERE id = NEW.role_id;

  IF (v_old_role_key = 'owner' OR v_new_role_key = 'owner') AND v_caller_role_key <> 'owner' THEN
    RAISE EXCEPTION 'Only a family owner can transfer or modify owner role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_family_member_mutation
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION famora.guard_family_member_mutation();

-- 2. Secure, atomic invitation acceptance RPC (never trusts client-supplied role or family_id)
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

REVOKE ALL ON FUNCTION famora.accept_family_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION famora.accept_family_invitation(TEXT) TO authenticated;

-- 3. Immutable Audit Logging Trigger for Sensitive Operations
CREATE OR REPLACE FUNCTION famora.log_sensitive_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_family_id UUID;
  v_actor_id UUID;
  v_action TEXT;
BEGIN
  v_family_id := COALESCE(NEW.family_id, OLD.family_id);
  v_actor_id := famora.current_member_id(v_family_id);
  v_action := TG_TABLE_NAME || '.' || lower(TG_OP);

  INSERT INTO public.activity_logs (
    family_id,
    actor_member_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  VALUES (
    v_family_id,
    v_actor_id,
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object('op', TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_family_members
  AFTER INSERT OR UPDATE OR DELETE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION famora.log_sensitive_activity();

CREATE TRIGGER trg_audit_member_overrides
  AFTER INSERT OR UPDATE OR DELETE ON public.member_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION famora.log_sensitive_activity();

CREATE TRIGGER trg_audit_family_invitations
  AFTER INSERT OR UPDATE ON public.family_invitations
  FOR EACH ROW EXECUTE FUNCTION famora.log_sensitive_activity();
