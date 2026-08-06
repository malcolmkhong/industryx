// Phase 1.5.4: Helper to check if a user is anonymous (guest).
// Used to enforce GUEST_GATED API rules.
//
// IMPORTANT: gates use `profiles.is_guest`, NOT `auth.users.is_anonymous`.
//
// Why: our architecture creates guest users via supabase.auth.admin.createUser
// (not signInAnonymously), so the auth.users.is_anonymous column is FALSE
// even for what we semantically consider guests. The profiles.is_guest
// column is the source of truth: it is set to true by the
// handle_new_user() trigger reading user_metadata.is_anonymous, and it is
// cleared by the confirm-link route when the user binds to OAuth (auth-wins).
//
// Lifecycle:
//   1. quickstart creates anon user         → profile.is_guest = true   (gated)
//   2. user binds OAuth (confirm-link)     → profile.is_guest = false  (unlocked)
//   3. archiveGuestProfile runs on GUEST   → GUEST profile.is_guest=false (audit shell)

import { getDbClient } from '@/lib/db/access';

export interface GuestCheckResult {
  isGuest: boolean;
  isLocked: boolean;
}

export async function getUserGuestStatus(
  userId: string,
): Promise<GuestCheckResult> {
  const supabase = getDbClient();
  if (!supabase) {
    return { isGuest: false, isLocked: false };
  }

  // Check profiles.is_guest (set by handle_new_user trigger from
  // user_metadata.is_anonymous; cleared by confirm-link's archiveGuestProfile).
  // This is reliable across both signInAnonymously and admin.createUser paths.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("is_guest")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    console.error("[guestCheck] profile lookup failed:", profileErr.message);
  }

  // Check server_game_state for lock state (independent of guest flag).
  const { data: state } = await supabase
    .from("server_game_state")
    .select("is_locked")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    isGuest: profile?.is_guest === true,
    isLocked: state?.is_locked === true,
  };
}
