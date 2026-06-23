// Phase 1.5.7: Update user profile (display_name)
// Sanitizes display name before storing.
//
// Iteration 9: routed through db/profiles.ts.

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { verifyAuthAndOwnership } from '@/lib/auth/verifyAuth';
import { updateProfileDisplayName } from '@/lib/db/profiles';

const MAX_DISPLAY_NAME_LENGTH = 32;
const FORBIDDEN_CHARS_REGEX = /[<>{}\[\]\\\/|`$%^&*+=]/;

function sanitizeDisplayName(input: string): string {
  let clean = input;
  clean = clean.split('').filter((ch) => {
    const code = ch.charCodeAt(0);
    if (code < 32) return false;
    if (code >= 127 && code <= 159) return false;
    return true;
  }).join('');
  clean = clean.split('').filter((ch) => ch !== '<' && ch !== '>').join('');
  return clean.slice(0, MAX_DISPLAY_NAME_LENGTH);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, displayName } = body as {
      userId?: string;
      displayName?: string;
    };

    if (!userId || typeof displayName !== 'string') {
      return NextResponse.json(
        { error: 'userId and displayName are required' },
        { status: 400 }
      );
    }

    const auth = await verifyAuthAndOwnership(userId);
    if (!auth.success) return auth.response;

    const rateLimitResponse = await checkRateLimit(
      auth.userId,
      RATE_LIMITS.action,
      '/api/auth/update-profile'
    );
    if (rateLimitResponse) return rateLimitResponse;

    const safeName = sanitizeDisplayName(displayName);

    if (safeName.length > 0 && FORBIDDEN_CHARS_REGEX.test(safeName)) {
      return NextResponse.json(
        { error: 'displayName contains invalid characters' },
        { status: 400 }
      );
    }

    const updated = await updateProfileDisplayName(userId, safeName || null);
    if (!updated) {
      return NextResponse.json(
        { error: 'Profile not found or update failed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      displayName: safeName,
    });
  } catch (error) {
    console.error('[UpdateProfile] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
