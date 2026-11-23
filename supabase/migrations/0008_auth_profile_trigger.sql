-- Migration 0008: Automatic Profile Initialization on User Signup

CREATE OR REPLACE FUNCTION famora.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
    'Famora Member'
  );

  INSERT INTO public.profiles (id, full_name, default_timezone, locale)
  VALUES (
    NEW.id,
    left(v_full_name, 120),
    coalesce(nullif(NEW.raw_user_meta_data ->> 'timezone', ''), 'UTC'),
    coalesce(nullif(NEW.raw_user_meta_data ->> 'locale', ''), 'en-US')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION famora.handle_new_user();
