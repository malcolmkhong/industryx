// Phase 1.5.4: Helper to check if a user is anonymous (guest).
// Used to enforce GUEST_GATED API rules.

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface GuestCheckResult {
  isGuest: boolean;
  isLocked: boolean;
}

export async function getUserGuestStatus(userId: string): Promise<GuestCheckResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return { isGuest: false, isLocked: false };
  }

  const { data: user } = await supabase.auth.admin.getUserById(userId);
  if (!user?.user) {
    return { isGuest: false, isLocked: false };
  }

  const { data: state } = await supabase
    .from('server_game_state')
    .select('is_locked')
    .eq('user_id', userId)
    .single();

  return {
    isGuest: user.user.is_anonymous === true,
    isLocked: state?.is_locked === true,
  };
}
