// ============================================
// IndustriaX: Player Profile API
// Lightweight GET — returns display_name + avatar_url for the header.
// Used by usePlayerDisplayName hook to prioritize game nickname over
// auth provider name in the UI.
// ============================================

import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db/access';
import { verifyAuthAndOwnership } from '@/lib/auth/verifyAuth';
import { getPlayerProgressByUserId } from '@/lib/db/game/playerProgress';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // Auth check
  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  const supabase = getDbClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }

  // Get game nickname from player_progress
  const progress = await getPlayerProgressByUserId(userId);
  const displayName = progress?.display_name ?? null;

  // Get avatar_url from auth metadata
  const { data: authData } = await supabase.auth.admin.getUserById(userId);
  const avatarUrl =
    authData?.user?.user_metadata?.avatar_url ??
    authData?.user?.user_metadata?.picture ??
    null;

  return NextResponse.json({
    display_name: displayName,
    avatar_url: avatarUrl,
  });
}
