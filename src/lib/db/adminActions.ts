/**
 * adminActions — Centralized access to the `admin_actions` table.
 *
 * This module is the ONLY place in the codebase that should call
 * `.from('admin_actions')`. All API routes and library code must
 * import query functions from here instead of touching the table directly.
 *
 * Iteration 2 of the Database Centralization migration (2026-06-20).
 * Migrated consumers: src/lib/auth/admin-helpers.ts logAdminAction(),
 * and all admin API routes that call logAdminAction.
 *
 * Conventions (decided in Phase 2 of the audit):
 *   - Async functions return `Promise<boolean>` for ops, `Promise<T | null>` for reads.
 *   - Throw for unexpected database errors.
 *   - Caller handles auth + rate limit + response shaping.
 *
 * Affected files (Iteration 2):
 *   - src/lib/db/adminActions.ts            (NEW)
 *   - src/lib/auth/admin-helpers.ts         (re-routes logAdminAction here)
 */

import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

// Type aliases from the generated Supabase types.
type AdminActionInsert = Database['public']['Tables']['admin_actions']['Insert'];
type AdminActionRow = Database['public']['Tables']['admin_actions']['Row'];

/**
 * Narrow shape for the logAdminAction() parameters used by routes.
 * Mirrors the public interface of the old auth-helpers.ts logAdminAction.
 */
export interface LogAdminActionParams {
  adminId: string;
  actionType: string;
  targetUserId?: string;
  details?: Record<string, unknown>;
}

/**
 * Insert a row into admin_actions for audit logging. Used by all
 * admin mutation routes.
 *
 * Preserves the original behavior from auth-helpers.ts:
 *   - Never throws — logs the error to console and returns void.
 *   - Defaults targetUserId to null when not provided.
 *   - Defaults details to {} when not provided.
 *   - Suppresses errors so audit-logging failures don't break the
 *     primary admin action.
 */
export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('admin_actions').insert({
      admin_user_id: params.adminId,
      target_user_id: params.targetUserId ?? null,
      action_type: params.actionType,
      details: (params.details ?? {}) as never,
    } satisfies AdminActionInsert);

    if (error) {
      console.error('[AdminActions] Failed to log admin action:', error.message);
    }
  } catch (err) {
    console.error(
      '[AdminActions] Failed to log admin action:',
      params.actionType,
      'by',
      params.adminId,
      err
    );
  }
}

/**
 * List recent admin actions. Used by the audit page. Returns empty
 * array on error.
 */
export async function listAdminActions(
  limit: number = 50
): Promise<AdminActionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('admin_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[AdminActions] Error listing actions:', error.message);
    return [];
  }
  return (data ?? []) as AdminActionRow[];
}
