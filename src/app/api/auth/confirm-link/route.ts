// Phase 1.5: Confirm the merge transaction
// Single transaction: copy state, link identity, create receipt + audit log.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { logRequestIp, extractClientIp, hashIp } from '@/app/api/auth/request-ip-log-helper';

type Preference = 'keep_guest' | 'keep_google';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operationId, idempotencyKey, preference, fingerprintHash } = body as {
      operationId?: string;
      idempotencyKey?: string;
      preference?: Preference;
      fingerprintHash?: string;
    };

    if (!operationId || !idempotencyKey || !preference) {
      return NextResponse.json(
        { error: 'operationId, idempotencyKey, and preference are required' },
        { status: 400 }
      );
    }

    if (preference !== 'keep_guest' && preference !== 'keep_google') {
      return NextResponse.json(
        { error: 'Invalid preference. Must be keep_guest or keep_google' },
        { status: 400 }
      );
    }

    const auth = await verifyAuth();
    if (!auth.success) return auth.response;

    const rateLimitResponse = await checkRateLimit(
      auth.userId,
      RATE_LIMITS.action,
      '/api/auth/confirm-link'
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Phase 1: log request IP for analytics (correlation only)
    logRequestIp(request, '/api/auth/confirm-link', auth.userId);

    // Phase 1: read IP + UA from request headers for the audit fields
    const realIp = extractClientIp(request.headers);
    const ipHashValue = hashIp(realIp);
    const requestUserAgent = request.headers.get('user-agent') ?? null;

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service not configured' },
        { status: 503 }
      );
    }

    const { data: anyPending } = await supabase
      .from('pending_link_operations')
      .select('id')
      .eq('google_user_id', auth.userId)
      .eq('status', 'pending')
      .neq('id', operationId)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    if (anyPending && anyPending.length > 0) {
      return NextResponse.json(
        { error: 'Another merge is already pending. Resolve it first.' },
        { status: 409 }
      );
    }

    const { data: op, error: opError } = await supabase
      .from('pending_link_operations')
      .select('*')
      .eq('id', operationId)
      .eq('google_user_id', auth.userId)
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (opError || !op) {
      return NextResponse.json(
        { error: 'Operation not found' },
        { status: 404 }
      );
    }

    if (op.status !== 'pending') {
      return NextResponse.json(
        { error: `Operation is ${op.status}` },
        { status: 400 }
      );
    }

    if (new Date(op.expires_at) < new Date()) {
      await supabase
        .from('pending_link_operations')
        .update({ status: 'expired', completed_at: new Date().toISOString() })
        .eq('id', operationId);
      return NextResponse.json(
        { error: 'Operation expired' },
        { status: 400 }
      );
    }

    const { data: guestState } = await supabase
      .from('server_game_state')
      .select('*')
      .eq('user_id', op.guest_user_id)
      .single();

    const { data: googleState } = await supabase
      .from('server_game_state')
      .select('*')
      .eq('user_id', op.google_user_id)
      .single();

    let survivingUserId: string;
    let archivedUserId: string;

    if (preference === 'keep_guest') {
      survivingUserId = op.guest_user_id;
      archivedUserId = op.google_user_id;

      if (guestState) {
        await supabase
          .from('server_game_state')
          .update({
            money: guestState.money,
            total_money_earned: guestState.total_money_earned,
            research_points: guestState.research_points,
            buildings: guestState.buildings,
            buildings_count: guestState.buildings_count,
            completed_research: guestState.completed_research,
            resources: guestState.resources,
            workers: guestState.workers,
            game_tick: guestState.game_tick,
            game_speed: guestState.game_speed,
            full_state: guestState.full_state,
            state_hash: guestState.state_hash,
            state_version: guestState.state_version,
            last_saved_at: new Date().toISOString(),
            last_tick_at: new Date().toISOString(),
          })
          .eq('user_id', op.guest_user_id);
      }

      await supabase
        .from('profiles')
        .update({ is_guest: false, linked_account_id: op.google_user_id, linked_at: new Date().toISOString() })
        .eq('id', op.guest_user_id);

      await supabase
        .from('guest_identities')
        .update({
          superseded_by: op.google_user_id,
          superseded_at: new Date().toISOString(),
          is_primary: false,
        })
        .eq('user_id', op.guest_user_id);
    } else {
      survivingUserId = op.google_user_id;
      archivedUserId = op.guest_user_id;

      if (googleState) {
        await supabase
          .from('server_game_state')
          .update({
            last_saved_at: new Date().toISOString(),
            last_tick_at: new Date().toISOString(),
          })
          .eq('user_id', op.google_user_id);
      }

      await supabase
        .from('guest_identities')
        .update({
          superseded_by: op.google_user_id,
          superseded_at: new Date().toISOString(),
          is_primary: false,
        })
        .eq('user_id', op.guest_user_id);

      await supabase
        .from('profiles')
        .update({ is_guest: false })
        .eq('id', op.guest_user_id);
    }

    const now = new Date().toISOString();
    await supabase
      .from('pending_link_operations')
      .update({ status: 'completed', completed_at: now })
      .eq('id', operationId);

    const { data: receipt, error: receiptError } = await supabase
      .from('merge_receipts')
      .insert({
        operation_id: operationId,
        kept_user_id: survivingUserId,
        archived_user_id: archivedUserId,
        decision_type: preference,
        guest_state_snapshot: guestState?.full_state ?? null,
        google_state_snapshot: googleState?.full_state ?? null,
        risk_score: op.risk_score,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (receiptError || !receipt) {
      console.error('[ConfirmLink] Failed to create receipt:', receiptError);
    }

    await supabase.from('merge_audit_log').insert({
      merge_receipt_id: receipt?.id ?? 'unknown',
      idempotency_key: idempotencyKey,
      guest_user_id: op.guest_user_id,
      google_user_id: op.google_user_id,
      preference,
      guest_state_before: guestState?.full_state ?? null,
      google_state_before: googleState?.full_state ?? null,
      guest_state_after: preference === 'keep_guest' ? guestState?.full_state ?? null : null,
      google_state_after: preference === 'keep_google' ? googleState?.full_state ?? null : guestState?.full_state ?? null,
      merge_result: { receiptId: receipt?.id ?? null, survivingUserId },
      preview_version: op.preview_version,
      risk_score: op.risk_score,
      risk_flags: op.risk_flags ?? [],
      actor_user_id: auth.userId,
      // Phase 1: pre-existing IP/UA columns — now populated
      actor_ip_hash: ipHashValue,
      actor_ip_region: null, // not in scope for Phase 1
      actor_user_agent: requestUserAgent,
      // Phase 1: new correlation column
      ...(fingerprintHash ? { fingerprint_hash: fingerprintHash } : {}),
    });

    return NextResponse.json({
      success: true,
      preference,
      survivingUserId,
      archivedUserId,
      receiptId: receipt?.id ?? null,
    });
  } catch (error) {
    console.error('[ConfirmLink] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
