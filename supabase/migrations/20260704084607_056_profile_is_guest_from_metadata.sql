CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fingerprint TEXT;
  v_is_guest BOOLEAN;
BEGIN
  v_fingerprint := NEW.raw_user_meta_data->>'fingerprint';

  v_is_guest :=
    COALESCE(NEW.is_anonymous, false)
    OR COALESCE((NEW.raw_user_meta_data->>'is_anonymous')::boolean, false);

  INSERT INTO public.profiles (id, is_guest, device_fingerprint, updated_at)
  VALUES (
    NEW.id,
    v_is_guest,
    v_fingerprint,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_guest = EXCLUDED.is_guest,
    device_fingerprint = COALESCE(
      profiles.device_fingerprint,
      EXCLUDED.device_fingerprint
    ),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Migration 056: is_guest derived from EITHER auth.users.is_anonymous (native signInAnonymously) OR user_metadata->''is_anonymous'' (admin.createUser fallback). fingerprint written from user_metadata->''fingerprint''.';
