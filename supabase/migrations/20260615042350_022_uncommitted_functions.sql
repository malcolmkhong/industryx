-- Migration 022: Capture auto_update_timestamp function
--
-- This function is referenced by the set_updated_at triggers on all game_config_* tables.
-- It exists in the live DB but has no migration file.

CREATE OR REPLACE FUNCTION public.auto_update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- No explicit grants needed — trigger functions are called by the trigger system,
-- not directly by users. But lock it down for defense in depth.
REVOKE EXECUTE ON FUNCTION public.auto_update_timestamp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_update_timestamp() TO service_role;
