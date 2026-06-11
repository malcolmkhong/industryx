import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { isAccountLocked, logActionAsync } from '@/lib/auth/gameStateValidator';
import { isAdminUserId } from '@/lib/auth/admin';
import { ResourceType } from '@/lib/game/types';
import { TRADE_COMMISSION_RATE, TRADABLE_RESOURCES_SET as FALLBACK_TRADABLE_SET } from '@/lib/game/tradeConstants';

interface TradeRequest {
  giveResource?: ResourceType;
  giveAmount?: number;
  receiveResource?: ResourceType;
}

let cachedTradableSet: Set<string> | null = null;
let cachedTradableAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getTradableSet(): Promise<Set<string>> {
  if (cachedTradableSet && Date.now() - cachedTradableAt < CACHE_TTL_MS) {
    return cachedTradableSet;
  }
  try {
    const supabase = createServiceRoleClient();
    if (supabase) {
      const { data } = await supabase
        .from('game_config_market')
        .select('resource_id')
        .eq('is_tradable', true);
      if (data && data.length > 0) {
        cachedTradableSet = new Set(data.map(r => r.resource_id));
        cachedTradableAt = Date.now();
        return cachedTradableSet;
      }
    }
  } catch (err) {
    console.warn('[Trade] Failed to load tradable resources from DB, using fallback:', err);
  }
  cachedTradableSet = new Set(FALLBACK_TRADABLE_SET);
  cachedTradableAt = Date.now();
  return cachedTradableSet;
}

export async function POST(request: Request) {
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.action, '/api/game/trade');
  if (rateLimitResponse) return rateLimitResponse;

  const lockStatus = await isAccountLocked(auth.userId);
  if (lockStatus.locked && !isAdminUserId(auth.userId)) {
    return NextResponse.json(
      { error: 'Account is locked', code: 'ACCOUNT_LOCKED', reason: lockStatus.reason },
      { status: 403 },
    );
  }

  let body: TradeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { giveResource, giveAmount, receiveResource } = body;

  if (!giveResource || !receiveResource || typeof giveAmount !== 'number') {
    return NextResponse.json({ error: 'giveResource, giveAmount, and receiveResource are required' }, { status: 400 });
  }

  if (!Number.isFinite(giveAmount) || giveAmount <= 0) {
    return NextResponse.json({ error: 'giveAmount must be a positive finite number' }, { status: 400 });
  }

  if (giveResource === receiveResource) {
    return NextResponse.json({ error: 'Cannot trade a resource for itself' }, { status: 400 });
  }

  const tradableSet = await getTradableSet();
  if (!tradableSet.has(giveResource) || !tradableSet.has(receiveResource)) {
    return NextResponse.json({ error: 'One or more resources are not tradable' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable — database not configured' },
      { status: 503 },
    );
  }

  const { data: serverState, error: stateError } = await supabase
    .from('server_game_state')
    .select('resources, full_state, game_tick, state_version, last_trade_at')
    .eq('user_id', auth.userId)
    .single();

  if (stateError || !serverState) {
    return NextResponse.json({ error: 'No authoritative server state found' }, { status: 404 });
  }

  const TRADE_COOLDOWN_SECONDS = 300;
  const lastTradeAt = serverState.last_trade_at
    ? new Date(serverState.last_trade_at).getTime()
    : null;
  if (lastTradeAt !== null) {
    const cooldownEndsAt = lastTradeAt + TRADE_COOLDOWN_SECONDS * 1000;
    const now = Date.now();
    if (now < cooldownEndsAt) {
      const retryAfter = Math.max(1, Math.ceil((cooldownEndsAt - now) / 1000));
      return NextResponse.json(
        {
          error: 'Trade cooldown active — wait before trading again',
          code: 'TRADE_COOLDOWN',
          retryAfter,
          cooldownSeconds: TRADE_COOLDOWN_SECONDS,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }
  }

  const resources = (serverState.resources ?? {}) as Record<string, number>;
  const fullState = (serverState.full_state ?? {}) as Record<string, unknown>;
  const resourceCapacity = (fullState.resourceCapacity ?? {}) as Record<string, number>;

  const availableGive = resources[giveResource] ?? 0;
  if (availableGive < giveAmount) {
    return NextResponse.json(
      { error: `Not enough ${giveResource}. Have ${Math.floor(availableGive)}, want ${giveAmount}` },
      { status: 400 },
    );
  }

  const { data: marketRows, error: marketError } = await supabase
    .from('game_config_market')
    .select('resource_id, base_price')
    .in('resource_id', [giveResource, receiveResource]);

  if (marketError || !marketRows || marketRows.length < 2) {
    return NextResponse.json({ error: 'Market config unavailable' }, { status: 503 });
  }

  const giveRow = marketRows.find((r: { resource_id: string }) => r.resource_id === giveResource);
  const receiveRow = marketRows.find((r: { resource_id: string }) => r.resource_id === receiveResource);

  const givePrice = Number((giveRow as { base_price?: number } | undefined)?.base_price ?? 0);
  const receivePrice = Number((receiveRow as { base_price?: number } | undefined)?.base_price ?? 0);

  if (!Number.isFinite(givePrice) || !Number.isFinite(receivePrice) || givePrice <= 0 || receivePrice <= 0) {
    return NextResponse.json({ error: 'Invalid market prices for trade resources' }, { status: 503 });
  }

  const receiveAmount = (giveAmount * givePrice * (1 - TRADE_COMMISSION_RATE)) / receivePrice;
  const currentReceive = resources[receiveResource] ?? 0;
  const receiveCap = resourceCapacity[receiveResource] ?? Number.POSITIVE_INFINITY;
  const finalReceiveAmount = Math.max(0, Math.min(receiveAmount, receiveCap - currentReceive));

  if (finalReceiveAmount <= 0) {
    return NextResponse.json({ error: `${receiveResource} storage is full` }, { status: 400 });
  }

  const newResources: Record<string, number> = {
    ...resources,
    [giveResource]: availableGive - giveAmount,
    [receiveResource]: currentReceive + finalReceiveAmount,
  };

  const currentVersion = Number(serverState.state_version) || 0;
  const nextStateVersion = currentVersion + 1;
  const updatedFullState = {
    ...fullState,
    resources: newResources,
  };

  const { data: updatedState, error: updateError } = await supabase
    .from('server_game_state')
    .update({
      resources: newResources,
      full_state: updatedFullState,
      state_version: nextStateVersion,
      last_trade_at: new Date().toISOString(),
    })
    .eq('user_id', auth.userId)
    .eq('state_version', currentVersion)
    .select('resources, state_version, game_tick')
    .single();

  if (updateError || !updatedState) {
    return NextResponse.json(
      { error: 'Trade conflict — state changed, please retry', code: 'STATE_VERSION_CONFLICT' },
      { status: 409 },
    );
  }

  await supabase.from('trade_history').insert({
    user_id: auth.userId,
    give_resource: giveResource,
    give_amount: giveAmount,
    receive_resource: receiveResource,
    receive_amount: finalReceiveAmount,
    commission_rate: TRADE_COMMISSION_RATE,
    server_validated: true,
    game_tick: Number(updatedState.game_tick) || 0,
  });

  await supabase.from('game_config_market_history').insert([
    {
      resource_id: giveResource,
      base_price: givePrice,
      game_tick: Number(updatedState.game_tick) || 0,
    },
    {
      resource_id: receiveResource,
      base_price: receivePrice,
      game_tick: Number(updatedState.game_tick) || 0,
    },
  ]);

  logActionAsync({
    userId: auth.userId,
    actionType: 'trade',
    payload: {
      giveResource,
      giveAmount,
      receiveResource,
      receiveAmount: finalReceiveAmount,
      commissionRate: TRADE_COMMISSION_RATE,
      source: 'server_authoritative_trade',
    },
    gameTick: Number(updatedState.game_tick) || 0,
    moneyAfter: Number((fullState.money as number) || 0),
    isValid: true,
    validationRisk: 'none',
  });

  return NextResponse.json({
    valid: true,
    giveResource,
    giveAmount,
    receiveResource,
    receiveAmount: finalReceiveAmount,
    resources: updatedState.resources,
    stateVersion: Number(updatedState.state_version) || nextStateVersion,
    serverValidated: true,
  });
}
