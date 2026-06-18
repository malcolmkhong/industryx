// ============================================
// /api/admin/market/resources
// Admin CRUD for game_config_market rows.
// Authoritative: data lives in the `game_config_market` table.
// The market tick (/api/market/tick) syncs new rows to `server_market_state`
// on the next 60s cycle, so resources added here become tradable automatically.
// ============================================

import { NextResponse } from 'next/server';
import { verifyAdmin, withSecurityHeaders } from '@/lib/auth/admin';
import { canWrite } from '@/lib/auth/admin-helpers';
import { createServiceRoleClient } from '@/lib/supabase/server';

const VALID_SECTORS = [
  'raw_minerals',
  'raw_organic',
  'basic_materials',
  'components',
  'advanced',
  'high_tech',
  'endgame',
  'agriculture',
] as const;
type ValidSector = (typeof VALID_SECTORS)[number];

const RESOURCE_ID_RE = /^[a-z][a-z0-9-]{0,49}$/;

interface ResourceBody {
  resource_id?: unknown;
  base_price?: unknown;
  sector?: unknown;
  elasticity?: unknown;
  is_tradable?: unknown;
}

function validateBody(body: ResourceBody):
  | { ok: true; data: { resource_id: string; base_price: number; sector: ValidSector; elasticity: number; is_tradable: boolean } }
  | { ok: false; error: string } {
  const { resource_id, base_price, sector, elasticity, is_tradable } = body ?? {};

  if (typeof resource_id !== 'string' || !RESOURCE_ID_RE.test(resource_id)) {
    return { ok: false, error: 'resource_id must be kebab-case (a-z, 0-9, hyphen), 1-50 chars' };
  }
  if (typeof base_price !== 'number' || !Number.isFinite(base_price) || base_price <= 0 || base_price > 1e9) {
    return { ok: false, error: 'base_price must be a positive finite number ≤ 1e9' };
  }
  if (typeof sector !== 'string' || !VALID_SECTORS.includes(sector as ValidSector)) {
    return { ok: false, error: `sector must be one of: ${VALID_SECTORS.join(', ')}` };
  }
  if (typeof elasticity !== 'number' || !Number.isFinite(elasticity) || elasticity < 0 || elasticity > 1.5) {
    return { ok: false, error: 'elasticity must be in [0, 1.5]' };
  }
  if (typeof is_tradable !== 'boolean') {
    return { ok: false, error: 'is_tradable must be a boolean' };
  }
  return {
    ok: true,
    data: {
      resource_id,
      base_price,
      sector: sector as ValidSector,
      elasticity,
      is_tradable,
    },
  };
}

// ─── POST: create new resource ──────────────────────────────────────────
export async function POST(request: Request) {
  const authResult = await verifyAdmin();
  if ('error' in authResult) return authResult.error;

  if (!(await canWrite(authResult.admin.id))) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Write permission required' }, { status: 403 }),
    );
  }

  let body: ResourceBody;
  try {
    body = await request.json();
  } catch {
    return withSecurityHeaders(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const validation = validateBody(body);
  if (!validation.ok) {
    return withSecurityHeaders(NextResponse.json({ error: validation.error }, { status: 400 }));
  }
  const data = validation.data;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Database not configured' }, { status: 503 }),
    );
  }

  // Check uniqueness
  const { data: existing } = await supabase
    .from('game_config_market')
    .select('resource_id')
    .eq('resource_id', data.resource_id)
    .maybeSingle();
  if (existing) {
    return withSecurityHeaders(
      NextResponse.json({ error: `Resource "${data.resource_id}" already exists` }, { status: 409 }),
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('game_config_market')
    .insert({
      resource_id: data.resource_id,
      base_price: data.base_price,
      sector: data.sector,
      elasticity: data.elasticity,
      is_tradable: data.is_tradable,
    })
    .select('resource_id, base_price, sector, elasticity, is_tradable')
    .single();

  if (insertError || !inserted) {
    return withSecurityHeaders(
      NextResponse.json({ error: insertError?.message ?? 'Insert failed' }, { status: 500 }),
    );
  }

  // Audit log
  await supabase.from('admin_actions').insert({
    admin_user_id: authResult.admin.id,
    action_type: 'market.create_resource',
    target_id: data.resource_id,
    payload: data as Record<string, unknown>,
    ip_address: request.headers.get('x-forwarded-for') ?? null,
  });

  return withSecurityHeaders(
    NextResponse.json({ success: true, resource: inserted }, { status: 201 }),
  );
}

// ─── PUT: update existing resource ──────────────────────────────────────
export async function PUT(request: Request) {
  const authResult = await verifyAdmin();
  if ('error' in authResult) return authResult.error;

  if (!(await canWrite(authResult.admin.id))) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Write permission required' }, { status: 403 }),
    );
  }

  let body: ResourceBody;
  try {
    body = await request.json();
  } catch {
    return withSecurityHeaders(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const validation = validateBody(body);
  if (!validation.ok) {
    return withSecurityHeaders(NextResponse.json({ error: validation.error }, { status: 400 }));
  }
  const data = validation.data;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Database not configured' }, { status: 503 }),
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('game_config_market')
    .update({
      base_price: data.base_price,
      sector: data.sector,
      elasticity: data.elasticity,
      is_tradable: data.is_tradable,
    })
    .eq('resource_id', data.resource_id)
    .select('resource_id, base_price, sector, elasticity, is_tradable')
    .single();

  if (updateError || !updated) {
    const code = updateError?.code;
    return withSecurityHeaders(
      NextResponse.json(
        { error: updateError?.message ?? 'Update failed', code: code ?? 'UNKNOWN' },
        { status: code === 'PGRST116' ? 404 : 500 },
      ),
    );
  }

  // Audit log
  await supabase.from('admin_actions').insert({
    admin_user_id: authResult.admin.id,
    action_type: 'market.update_resource',
    target_id: data.resource_id,
    payload: data as Record<string, unknown>,
    ip_address: request.headers.get('x-forwarded-for') ?? null,
  });

  return withSecurityHeaders(
    NextResponse.json({ success: true, resource: updated }),
  );
}
