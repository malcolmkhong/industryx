// ============================================
// /api/admin/market/resources/[id]
// Admin delete a single game_config_market row.
// ============================================

import { NextResponse } from 'next/server';
import { verifyAdmin, withSecurityHeaders } from '@/lib/auth/admin';
import { canWrite } from '@/lib/auth/admin-helpers';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const authResult = await verifyAdmin();
  if ('error' in authResult) return authResult.error;

  if (!(await canWrite(authResult.admin.id))) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Write permission required' }, { status: 403 }),
    );
  }

  const resourceId = params.id;
  if (!/^[a-z][a-z0-9-]{0,49}$/.test(resourceId)) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Invalid resource_id format' }, { status: 400 }),
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Database not configured' }, { status: 503 }),
    );
  }

  // Block delete if the resource is referenced in trade history (audit trail)
  const { count: historyCount } = await supabase
    .from('trade_history')
    .select('id', { count: 'exact', head: true })
    .or(`give_resource.eq.${resourceId},receive_resource.eq.${resourceId}`);

  if (historyCount && historyCount > 0) {
    return withSecurityHeaders(
      NextResponse.json(
        {
          error: `Cannot delete "${resourceId}" — referenced in ${historyCount} trade history record(s). Set is_tradable=false instead to retire it.`,
          code: 'RESOURCE_HAS_HISTORY',
        },
        { status: 409 },
      ),
    );
  }

  const { error: deleteError } = await supabase
    .from('game_config_market')
    .delete()
    .eq('resource_id', resourceId);

  if (deleteError) {
    return withSecurityHeaders(
      NextResponse.json({ error: deleteError.message }, { status: 500 }),
    );
  }

  // Audit log
  await supabase.from('admin_actions').insert({
    admin_user_id: authResult.admin.id,
    action_type: 'market.delete_resource',
    target_id: resourceId,
    payload: { resource_id: resourceId },
    ip_address: request.headers.get('x-forwarded-for') ?? null,
  });

  return withSecurityHeaders(
    NextResponse.json({ success: true, resource_id: resourceId }),
  );
}
