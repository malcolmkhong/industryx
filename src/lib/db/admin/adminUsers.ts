/**
 * adminUsers.ts — Centralized DB access for Supabase Auth admin user listing.
 *
 * Iteration 8. Wraps `supabase.auth.admin.listUsers()` so routes don't need
 * to instantiate the service-role client or handle auth API quirks.
 *
 * Single source of truth for identity/auth data. Game tables do NOT duplicate
 * these fields. Future providers (GitHub, Discord, etc.) require zero changes
 * here — `provider` and `providers` are read from `app_metadata` at call time.
 *
 * Note: This does NOT touch the `admin_users` table (which is for app-level
 * RBAC roles). That table is handled by `db/admins.ts`. This module is
 * specifically for the Auth Admin API (auth.users + auth.admin).
 *
 * Response shape (from Supabase Auth Admin API):
 *   User {
 *     id: string,
 *     email?: string,
 *     app_metadata: { provider?: string, providers?: string[] },
 *     user_metadata: { name?, full_name?, avatar_url?, picture?, ... },
 *     identities: Array<{ provider: string, provider_id: string, ... }>,
 *     created_at: string,
 *     last_sign_in_at?: string,
 *     email_confirmed_at?: string,
 *     banned_until?: string | null,
 *     ...
 *   }
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Provider-agnostic auth identity shape.
 * Safe to expose to admin UI — no tokens, no password hashes, no secrets.
 *
 * - `provider`        — active sign-in provider (latest sign-in wins)
 * - `providers`       — ALL linked providers (multi-provider audit)
 * - `full_name`       — from `user_metadata.full_name` (Google/GitHub give this)
 * - `avatar_url`      — from `user_metadata.avatar_url` or `user_metadata.picture`
 * - `banned_until`    — ISO timestamp; non-null = banned
 */
export interface AuthUser {
  id: string;
  email?: string;
  is_anonymous?: boolean;
  provider?: string;
  providers?: string[];
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  banned_until?: string | null;
}

/**
 * Internal raw shape we read from `supabase.auth.admin.listUsers()`.
 * Narrow — surface SDK drift early.
 */
type RawUser = {
  id: string;
  email?: string;
  is_anonymous?: boolean;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
  created_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  banned_until?: string | null;
};

/**
 * Allow only https:// avatar URLs. Blocks javascript:, data:, http://, etc.
 * Prevents XSS via attacker-controlled user_metadata.avatar_url.
 */
function safeAvatarUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('https://')) return undefined;
  return url;
}

/**
 * Map a raw Supabase Auth User to our safe AuthUser shape.
 * Pure function — easy to unit test.
 */
function mapAuthUser(u: RawUser): AuthUser {
  const meta = u.user_metadata ?? {};
  const avatar = safeAvatarUrl(meta.avatar_url ?? meta.picture);
  const fullName = meta.full_name ?? meta.name ?? undefined;
  return {
    id: u.id,
    email: u.email,
    is_anonymous: u.is_anonymous ?? false,
    provider: u.app_metadata?.provider ?? undefined,
    providers: u.app_metadata?.providers ?? undefined,
    full_name: fullName,
    avatar_url: avatar,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed_at: u.email_confirmed_at,
    banned_until: u.banned_until ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

/**
 * List all authenticated users (Supabase Auth admin).
 * Service-role client; bypasses RLS by design.
 *
 * Returns `[]` on missing client, error, or no users.
 *
 * NOTE: This is the full auth roster. For per-player lookups prefer
 * `filterAuthUsersByIds(ids)` or `getAuthUserById(id)`.
 */
export async function listAllAuthUsers(): Promise<AuthUser[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error || !data?.users) return [];
    return data.users.map((u: RawUser) => mapAuthUser(u));
  } catch {
    return [];
  }
}

/**
 * Legacy: filter to a Record<id, email> for the player list views.
 * Behavior unchanged — existing 4 call sites keep working.
 */
export async function filterAuthUsersByIds(
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const all = await listAllAuthUsers();
  const idSet = new Set(userIds);
  const out: Record<string, string> = {};
  for (const u of all) {
    if (idSet.has(u.id) && u.email) out[u.id] = u.email;
  }
  return out;
}

/**
 * Enriched variant: returns full AuthUser per id (provider, avatar, last_sign_in, ...).
 * For admin player detail pages / enriched table rows.
 */
export async function filterAuthUsersEnrichedByIds(
  userIds: string[],
): Promise<Record<string, AuthUser>> {
  if (userIds.length === 0) return {};
  const all = await listAllAuthUsers();
  const idSet = new Set(userIds);
  const out: Record<string, AuthUser> = {};
  for (const u of all) {
    if (idSet.has(u.id)) out[u.id] = u;
  }
  return out;
}

/**
 * Single-user lookup. For admin opening a specific player detail page.
 * Avoids the cost of fetching the whole auth roster.
 */
export async function getAuthUserById(userId: string): Promise<AuthUser | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return mapAuthUser(data.user as RawUser);
  } catch {
    return null;
  }
}

/**
 * Filter to users by active provider.
 * Useful for security audits: "show all email-only accounts" or
 * "show all Google OAuth users" — independent of linked providers[].
 */
export async function listAuthUsersByProvider(
  provider: 'google' | 'github' | 'email' | 'azure' | 'apple' | 'facebook' | 'twitter' | 'discord' | 'keycloak' | string,
): Promise<AuthUser[]> {
  const all = await listAllAuthUsers();
  return all.filter((u) => u.provider === provider);
}