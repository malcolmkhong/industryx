/**
 * Database Barrel — Industry-Standard Single Import Point
 *
 * Re-exports Supabase client factories and the generated Database type.
 *
 * Usage:
 *   import { createServiceRoleClient, createClient, Database } from '@/lib/db';
 *
 * The existing @/lib/supabase/server imports continue to work unchanged.
 * New code SHOULD prefer @/lib/db for admin/user separation.
 */

export type { Database } from './types';
export { createServiceRoleClient, isServiceRoleConfigured } from './admin';
export { createClient, isSupabaseConfigured } from './user';
