// ============================================================================
// IndustriaX: Support Tickets DB Helper
// Centralized access to `support_tickets` and `support_messages` tables.
// Replaces inline `.from('support_tickets')` / `.from('support_messages')`
// calls across `src/app/api/support/**` routes.
// ============================================================================

import { createServiceRoleClient } from '@/lib/db/access';;
import type { Database } from '@/lib/db/types';

type SupportTicketRow = Database['public']['Tables']['support_tickets']['Row'];
type SupportTicketInsert = Database['public']['Tables']['support_tickets']['Insert'];
type SupportTicketUpdate = Database['public']['Tables']['support_tickets']['Update'];
type SupportMessageRow = Database['public']['Tables']['support_messages']['Row'];
type SupportMessageInsert = Database['public']['Tables']['support_messages']['Insert'];

export type SupportTicketStatus = 'open' | 'accepted' | 'resolved';

/**
 * Filter for listTickets.
 */
export interface TicketFilters {
  userId?: string;
  status?: SupportTicketStatus | SupportTicketStatus[];
  acceptedBy?: string;
  limit?: number;
}

/**
 * List tickets with optional filters.
 * Returns most recent first (created_at DESC) by default.
 */
export async function listTickets(filters: TicketFilters = {}): Promise<SupportTicketRow[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  let query = supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.acceptedBy) query = query.eq('accepted_by', filters.acceptedBy);
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) {
    console.error('[SupportTickets] Failed to list tickets:', error);
    return [];
  }
  return data || [];
}

/**
 * Get a single ticket by ID.
 * Returns null if not found.
 */
export async function getTicket(id: string): Promise<SupportTicketRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[SupportTickets] Failed to get ticket:', error);
    return null;
  }
  return data as SupportTicketRow;
}

/**
 * Create a new ticket.
 * Returns the inserted row, or null on failure.
 */
export async function createTicket(
  values: SupportTicketInsert
): Promise<SupportTicketRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('support_tickets')
    .insert(values)
    .select()
    .single();

  if (error) {
    console.error('[SupportTickets] Failed to create ticket:', error);
    return null;
  }
  return data as SupportTicketRow;
}

/**
 * Update a ticket by ID (status, accepted_by, resolved_at).
 */
export async function updateTicket(
  id: string,
  patch: SupportTicketUpdate
): Promise<SupportTicketRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('support_tickets')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[SupportTickets] Failed to update ticket:', error);
    return null;
  }
  return data as SupportTicketRow;
}

/**
 * Mark a ticket as resolved.
 * No-op if the ticket does not exist or is already resolved.
 */
export async function resolveTicket(id: string): Promise<SupportTicketRow | null> {
  return updateTicket(id, {
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  });
}

/**
 * List messages on a ticket, oldest first (chronological).
 */
export async function listTicketMessages(ticketId: string): Promise<SupportMessageRow[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SupportTickets] Failed to list messages:', error);
    return [];
  }
  return data || [];
}

/**
 * Add a message to a ticket.
 * Caller is responsible for validating ticket ownership and status.
 */
export async function addTicketMessage(
  values: SupportMessageInsert
): Promise<SupportMessageRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('support_messages')
    .insert(values)
    .select()
    .single();

  if (error) {
    console.error('[SupportTickets] Failed to add message:', error);
    return null;
  }
  return data as SupportMessageRow;
}