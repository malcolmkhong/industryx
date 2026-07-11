'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Check if Supabase is configured (env vars present).
 * Safe to call from client components — only checks NEXT_PUBLIC_ vars.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase client is not configured');
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  );
}
