CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fingerprint TEXT;
BEGIN
  v_fingerprint := NEW.raw_user_meta_data->>'fingerprint';

  INSERT INTO public.profiles (id, is_guest, device_fingerprint, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.is_anonymous, false) = true,
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
  'Migration 055: trigger auto-populates profiles.device_fingerprint from raw_user_meta_data->''fingerprint''. The fallback path COALESCE() preserves any historical fingerprint that was backfilled or set manually.';
