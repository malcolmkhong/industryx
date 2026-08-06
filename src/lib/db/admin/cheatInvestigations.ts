// ============================================================================
// IndustriaX: Cheat Investigations DB Helper
// Centralized access to the `cheat_investigations` table.
// Replaces inline `.from('cheat_investigations')` calls across the admin
// investigations routes AND the flagCheatAttempt enrichment in
// gameStateValidator.ts.
// ============================================================================

import { getDbClient } from '@/lib/db/access';
import type { Database } from '@/lib/db/types';

type CheatInvestigationRow = Database['public']['Tables']['cheat_investigations']['Row'];
type CheatInvestigationInsert = Database['public']['Tables']['cheat_investigations']['Insert'];
type CheatInvestigationUpdate = Database['public']['Tables']['cheat_investigations']['Update'];

export type InvestigationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type InvestigationStatus = 'open' | 'resolved' | 'dismissed';

/**
 * Filter for listInvestigations.
 */
export interface InvestigationFilters {
  status?: InvestigationStatus | InvestigationStatus[];
  severity?: InvestigationSeverity | InvestigationSeverity[];
  detectionType?: string;
  userId?: string;
  resolvedBy?: string;
  from?: number;
  to?: number;
}

/**
 * Paginated result from listInvestigations.
 */
export interface ListInvestigationsResult {
  data: CheatInvestigationRow[];
  total: number;
}

/**
 * List investigations with optional filters and pagination.
 * Returns data + total count for client-side pagination.
 */
export async function listInvestigations(
  filters: InvestigationFilters = {}
): Promise<ListInvestigationsResult> {
  const supabase = getDbClient();
  if (!supabase) return { data: [], total: 0 };

  let query = supabase
    .from('cheat_investigations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }
  if (filters.severity) {
    if (Array.isArray(filters.severity)) {
      query = query.in('severity', filters.severity);
    } else {
      query = query.eq('severity', filters.severity);
    }
  }
  if (filters.detectionType) query = query.eq('detection_type', filters.detectionType);
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.resolvedBy) query = query.eq('resolved_by', filters.resolvedBy);
  if (typeof filters.from === 'number' && typeof filters.to === 'number') {
    query = query.range(filters.from, filters.to);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('[CheatInvestigations] Failed to list:', error);
    return { data: [], total: 0 };
  }
  return { data: data || [], total: count ?? 0 };
}

/**
 * Count investigations in any of the given statuses resolved since `sinceISO`.
 * Used for "resolved today" stats on the admin dashboard.
 */
export async function countResolvedSince(
  sinceISO: string,
  statuses: InvestigationStatus[] = ['resolved', 'dismissed']
): Promise<number> {
  const supabase = getDbClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from('cheat_investigations')
    .select('*', { count: 'exact', head: true })
    .in('status', statuses)
    .gte('resolved_at', sinceISO);

  if (error) {
    console.error('[CheatInvestigations] Failed to count resolved:', error);
    return 0;
  }
  return count ?? 0;
}

/**
 * Get a single investigation by ID.
 * Returns null if not found.
 */
export async function getInvestigation(id: string): Promise<CheatInvestigationRow | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('cheat_investigations')
    .select(
      'id,user_id,detection_type,description,evidence,status,device_id,fingerprint_hash,resolution_note,resolved_by,resolved_at,created_at,updated_at',
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[CheatInvestigations] Failed to get:', error);
    return null;
  }
  return data as unknown as CheatInvestigationRow;
}

/**
 * Insert a new investigation row.
 * Caller should use the `increment_cheat_flag` RPC for the full atomic flow;
 * this helper is for direct inserts (e.g. legacy callers or tests).
 */
export async function flagCheat(
  values: CheatInvestigationInsert
): Promise<CheatInvestigationRow | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('cheat_investigations')
    .insert(values)
    .select(
      'id,user_id,detection_type,description,evidence,status,device_id,fingerprint_hash,resolution_note,resolved_by,resolved_at,created_at,updated_at',
    )
    .single();

  if (error) {
    console.error('[CheatInvestigations] Failed to flag cheat:', error);
    return null;
  }
  return data as unknown as CheatInvestigationRow;
}

/**
 * Update an investigation (status, resolution note, fingerprint, etc.).
 */
export async function updateInvestigation(
  id: string,
  patch: CheatInvestigationUpdate
): Promise<CheatInvestigationRow | null> {
  const supabase = getDbClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('cheat_investigations')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[CheatInvestigations] Failed to update:', error);
    return null;
  }
  return data as CheatInvestigationRow;
}

/**
 * Resolve an investigation. Sets status, resolution_note, resolved_by, resolved_at.
 */
export async function resolveInvestigation(
  id: string,
  note: string,
  resolvedBy: string
): Promise<CheatInvestigationRow | null> {
  return await updateInvestigation(id, {
    status: 'resolved',
    resolution_note: note.trim(),
    resolved_by: resolvedBy,
    resolved_at: new Date().toISOString(),
  });
}

/**
 * Dismiss an investigation. Same fields as resolve, status='dismissed'.
 */
export async function dismissInvestigation(
  id: string,
  note: string,
  resolvedBy: string
): Promise<CheatInvestigationRow | null> {
  return await updateInvestigation(id, {
    status: 'dismissed',
    resolution_note: note.trim(),
    resolved_by: resolvedBy,
    resolved_at: new Date().toISOString(),
  });
}

/**
 * Enrich the most recent investigation for a user with fingerprint/device info.
 * Used by `flagCheatAttempt` after the `increment_cheat_flag` RPC inserts.
 * Best-effort: returns the count of updated rows (0 or 1).
 */
export async function enrichLatestInvestigation(
  userId: string,
  fingerprintHash?: string | null,
  deviceId?: string | null
): Promise<number> {
  if (!fingerprintHash && !deviceId) return 0;
  const supabase = getDbClient();
  if (!supabase) return 0;

  const updatePayload: Record<string, string> = {};
  if (fingerprintHash) updatePayload.fingerprint_hash = fingerprintHash;
  if (deviceId) updatePayload.device_id = deviceId;

  const { data, error } = await supabase
    .from('cheat_investigations')
    .update(updatePayload)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .select('id');

  if (error) {
    console.warn('[CheatInvestigations] enrichLatest failed:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

// ============================================
// Iteration 8 — getLatestCheatInvestigation for jobs dashboard
// ============================================

export interface LatestCheatInvestigationRow {
  created_at: string;
}

/**
 * Returns the most recent cheat_investigation created_at timestamp.
 * Used by /api/admin/system/jobs for the "Validate Ticks" cron row.
 */
export async function getLatestCheatInvestigation(): Promise<LatestCheatInvestigationRow | null> {
  const supabase = getDbClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('cheat_investigations')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LatestCheatInvestigationRow | null) ?? null;
}

export async function countOpenCheatInvestigations(): Promise<number> {
  const supabase = getDbClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('cheat_investigations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  return count ?? 0;
}

export async function countRecentCheatFlagsSince(sinceISO: string): Promise<number> {
  const supabase = getDbClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('cheat_investigations')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceISO);
  return count ?? 0;
}

// ============================================
// Iteration 10 — increment_cheat_flag RPC wrapper
// ============================================

/**
 * Atomic cheat-flag increment.
 *
 * Phase 4.1: this RPC eliminates the TOCTOU race present in the old
 * read-then-write pattern. It handles the increment on both
 * player_progress and server_game_state, the investigations insert, and
 * auto-lock if threshold is reached — all in one transaction.
 *
 * Returns true if the RPC succeeded (error === null), false on any
 * failure (DB unreachable, RPC error, etc.).
 */
export async function incrementCheatFlag(params: {
  userId: string;
  flagType: string;
  description: string;
  severity: InvestigationSeverity;
}): Promise<boolean> {
  const supabase = getDbClient();
  if (!supabase) return false;

  const { error } = await supabase.rpc('increment_cheat_flag', {
    p_user_id: params.userId,
    p_flag_type: params.flagType,
    p_description: params.description,
    p_severity: params.severity,
  });

  if (error) {
    console.error('[CheatInvestigations] increment_cheat_flag failed:', error.message);
    return false;
  }
  return true;
}
