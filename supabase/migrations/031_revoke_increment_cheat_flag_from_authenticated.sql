-- ============================================================================
-- Migration 031: Lock down increment_cheat_flag RPC to service_role only
-- ============================================================================
-- Purpose: The function accepts p_user_id as a parameter and does NOT verify
--          that the caller is authorized to flag that user. Previously granted
--          to the `authenticated` role, any logged-in user could call it to
--          flag any other user (DoS / harassment vector).
--
--          Restrict to service_role only. The Next.js backend uses the service
--          role client when calling this function. The Cloudflare markettick
--          worker and /api/cron/validate-ticks already use service role.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(UUID, TEXT, TEXT, TEXT) TO service_role;
