// ============================================
// IndustriaX: API Authentication Helper
// Verifies Supabase session from cookies
// and ensures userId matches authenticated user
// ============================================

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export interface AuthResult {
  success: true;
  userId: string;
  email?: string;
}

export interface AuthError {
  success: false;
  response: NextResponse;
}

/**
 * Verify that the request comes from an authenticated user.
 * Uses the cookie-based Supabase SSR client to extract the session.
 *
 * Usage:
 *   const auth = await verifyAuth();
 *   if (!auth.success) return auth.response;
 *   // auth.userId is now verified
 */
export async function verifyAuth(): Promise<AuthResult | AuthError> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.warn('[Auth] Session verification failed:', error.message);
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Authentication required', code: 'AUTH_REQUIRED' },
          { status: 401 },
        ),
      };
    }

    if (!user) {
      console.warn('[Auth] No user found in session');
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Authentication required', code: 'AUTH_REQUIRED' },
          { status: 401 },
        ),
      };
    }

    return {
      success: true,
      userId: user.id,
      email: user.email,
    };
  } catch (err) {
    console.error('[Auth] Unexpected error during verification:', err);
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Authentication service unavailable', code: 'AUTH_SERVICE_ERROR' },
        { status: 503 },
      ),
    };
  }
}

/**
 * Verify that the authenticated user matches the requested userId.
 * This prevents users from accessing other players' data.
 */
export async function verifyAuthAndOwnership(
  requestUserId: string,
): Promise<AuthResult | AuthError> {
  const auth = await verifyAuth();

  if (!auth.success) return auth;

  if (auth.userId !== requestUserId) {
    console.warn(`[Auth] User ${auth.userId} attempted to access data for ${requestUserId}`);
    return {
      success: false,
      response: NextResponse.json(
        { error: 'You can only access your own data', code: 'FORBIDDEN_OWNERSHIP' },
        { status: 403 },
      ),
    };
  }

  return auth;
}
