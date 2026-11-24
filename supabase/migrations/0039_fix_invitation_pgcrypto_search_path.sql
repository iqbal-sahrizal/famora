-- Migration 0039: Include extensions schema in invitation RPCs so pgcrypto digest() resolves

ALTER FUNCTION famora.accept_family_invitation(TEXT)
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION famora.get_invitation_preview(TEXT)
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION famora.reject_family_invitation(TEXT)
  SET search_path = public, extensions, pg_temp;
