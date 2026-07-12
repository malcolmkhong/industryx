import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { isAccountLocked, logActionAsync } from '@/lib/auth/gameStateValidator';
import { isAdminUserId } from '@/lib/auth/admin';
import { getUserGuestStatus } from '@/lib/auth/guestCheck';
import type { ResourceType } from "@/lib/game/shared/types/types";
import { TRADABLE_RESOURCES_SET as FALLBACK_TRADABLE_SET } from '@/lib/game/market/trade/tradeConstants';
import {
  loadServerGameStateForTrade,
  saveServerGameStateOptimistic,
} from '@/lib/db/game/serverGameState';
import { recordTrade } from '@/lib/db/game/trades';
import { getBalance } from '@/lib/game/config/balance/balanceConfig';
import { ensureConfigLoaded } from '@/lib/game/config/server/configLoader.server';
import { asFullState } from '@/lib/db/game/serverGameStatePayload';

interface TradeRequest {
  giveResource?: ResourceType;
  giveAmount?: number;
  receiveResource?: ResourceType;
}

let cachedTradableSet: Set<string> | null = null;
let cachedTradableAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function rememberTradableSet(tradableSet: Set<string>): Set<string> {
  cachedTradableSet = tradableSet;
  cachedTradableAt = Date.now();
  return tradableSet;
}

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
        return rememberTradableSet(new Set(data.map(r => r.resource_id)));
      }
    }
  } catch (err) {
    console.warn('[Trade] Failed to load tradable resources from DB, using fallback:', err);
  }
  return rememberTradableSet(new Set(FALLBACK_TRADABLE_SET));
}

export async function POST(request: Request) {
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const guestStatus = await getUserGuestStatus(auth.userId);
  if (guestStatus.isGuest) {
    return NextResponse.json(
      { error: 'Bind Account to access Trading Post', code: 'GUEST_GATED' },
      { status: 403 }
    );
  }

  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.action, '/api/market/trades/execute');
  if (rateLimitResponse) return rateLimitResponse;

  // Phase 3 Step 1: pull latest balance overrides so trade.* values are
  // current. Fail-closed per RULES.md [SEC-002] / [ARC-011]: if Supabase is
  // unreachable, refuse the request. do NOT swallow the error and fall
  // back to code-level defaults (that's a security hole).
  const configLoad = await ensureConfigLoaded();
  if (!configLoad.ok) {
    console.error(
      "[TradeAPI] config load failed:",
      configLoad.error ?? "unknown",
    );
    return NextResponse.json(
      { error: "Service temporarily unavailable", code: "CONFIG_UNAVAILABLE" },
      { status: 503 },
    );
  }

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

  const serverState = await loadServerGameStateForTrade(auth.userId);
  if (!serverState) {
    return NextResponse.json({ error: 'No authoritative server state found' }, { status: 404 });
  }

  const tradeCooldownSeconds = getBalance().trade.cooldownSeconds;
  const lastTradeAt = serverState.last_trade_at
    ? new Date(serverState.last_trade_at).getTime()
    : null;
  if (lastTradeAt !== null) {
    const cooldownEndsAt = lastTradeAt + tradeCooldownSeconds * 1000;
    const now = Date.now();
    if (now < cooldownEndsAt) {
      const retryAfter = Math.max(1, Math.ceil((cooldownEndsAt - now) / 1000));
      return NextResponse.json(
        {
          error: 'Trade cooldown active — wait before trading again',
          code: 'TRADE_COOLDOWN',
          retryAfter,
          cooldownSeconds: tradeCooldownSeconds,
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
    .select('resource_id, base_price, sector, elasticity')
    .in('resource_id', [giveResource, receiveResource]);

  if (marketError || !marketRows || marketRows.length < 2) {
    return NextResponse.json({ error: 'Market config unavailable' }, { status: 503 });
  }

  // Read LIVE current prices from server_market_state (Gap 1 fix).
  // Fall back to base_price only when market hasn't initialized yet (first tick).
  const { data: marketState } = await supabase
    .from('server_market_state')
    .select('prices')
    .eq('id', 1)
    .single();

  const livePrices = (marketState?.prices ?? []) as Array<{
    resource: string;
    currentPrice: number;
    basePrice: number;
  }>;
  const livePriceMap = new Map(livePrices.map((p) => [p.resource, p.currentPrice]));

  const giveRow = marketRows.find((r: { resource_id: string }) => r.resource_id === giveResource);
  const receiveRow = marketRows.find((r: { resource_id: string }) => r.resource_id === receiveResource);

  const giveBasePrice = Number((giveRow as { base_price?: number } | undefined)?.base_price ?? 0);
  const receiveBasePrice = Number((receiveRow as { base_price?: number } | undefined)?.base_price ?? 0);
  // Phase 2 (Gap 3): per-resource elasticity now lives in `game_config_market.elasticity`.
  // Trade route reads it directly; new resources added via admin UI get the default (0.4).
  const giveElasticity = Number((giveRow as { elasticity?: number } | undefined)?.elasticity ?? 0.4);
  const receiveElasticity = Number((receiveRow as { elasticity?: number } | undefined)?.elasticity ?? 0.4);

  // Prefer live current price; fall back to base price when no market data yet
  const givePrice = livePriceMap.get(giveResource) ?? giveBasePrice;
  const receivePrice = livePriceMap.get(receiveResource) ?? receiveBasePrice;

  if (!Number.isFinite(givePrice) || !Number.isFinite(receivePrice) || givePrice <= 0 || receivePrice <= 0) {
    return NextResponse.json({ error: 'Invalid market prices for trade resources' }, { status: 503 });
  }

  // Slippage: large trades (relative to typical volume) move price against trader.
  // Formula: slippageRatio = (giveAmount / 1000) * elasticity * 0.001
  // At giveAmount=1000, elasticity=0.5: ~0.05% slippage (negligible at normal volumes)
  // At giveAmount=1_000_000, elasticity=0.5: ~50% slippage (capped below)
  const giveValue = giveAmount * givePrice;
  const slippageCoefficient = getBalance().trade.slippageCoefficient;
  const maxSlippage = getBalance().trade.maxSlippage;
  const giveSlippage = Math.min(
    maxSlippage,
    Math.sqrt(giveValue / 1000) * giveElasticity * slippageCoefficient,
  );
  const receiveSlippage = Math.min(
    maxSlippage,
    Math.sqrt(giveValue / 1000) * receiveElasticity * slippageCoefficient,
  );
  // Apply slippage: trade fills at a slightly worse price
  const effectiveGivePrice = givePrice * (1 - giveSlippage);
  const effectiveReceivePrice = receivePrice * (1 + receiveSlippage);

  const receiveAmount = (giveAmount * effectiveGivePrice * (1 - getBalance().trade.commissionRate)) / effectiveReceivePrice;
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

  // Fail-closed per RULES.md [SEC-011]: state_version must be a valid
  // non-negative integer; refuse rather than silently default to 0.
  const currentVersion = Number(serverState.state_version);
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    console.error(
      "[TradeAPI] Invalid state_version for trade persist:",
      serverState.state_version,
    );
    return NextResponse.json(
      { error: "Invalid server state version", code: "INVALID_STATE_VERSION" },
      { status: 503 },
    );
  }
  const nextStateVersion = currentVersion + 1;
  const updatedFullState = {
    ...fullState,
    resources: newResources,
  };

  const updatedState = await saveServerGameStateOptimistic(
    auth.userId,
    currentVersion,
    {
      resources: asFullState(newResources),
      full_state: asFullState(updatedFullState),
      state_version: nextStateVersion,
      last_trade_at: new Date().toISOString(),
    }
  );

  if (!updatedState) {
    return NextResponse.json(
      { error: 'Trade conflict — state changed, please retry', code: 'STATE_VERSION_CONFLICT' },
      { status: 409 },
    );
  }

  // Validate updatedState.game_tick at trust boundary (BIGINT column
  // rejects NaN anyway, but warn+skip is cleaner than silent DB error).
  const tradeGameTick = Number(updatedState.game_tick);
  if (!Number.isInteger(tradeGameTick) || tradeGameTick < 0) {
    console.error(
      "[TradeAPI] Invalid game_tick in updated state:",
      updatedState.game_tick,
    );
    return NextResponse.json(
      { error: "Invalid game tick in state", code: "INVALID_GAME_TICK" },
      { status: 503 },
    );
  }

  await recordTrade({
      userId: auth.userId,
      giveResource,
      giveAmount,
      receiveResource,
      receiveAmount: finalReceiveAmount,
      commissionRate: getBalance().trade.commissionRate,
      gameTick: tradeGameTick,
      serverStateVersion: nextStateVersion,
    });

  // Record effective (live) prices in history — not just the static base_price.
  // This gives the price chart real data to plot.
  await supabase.from('game_config_market_history').insert([
      {
        resource_id: giveResource,
        base_price: effectiveGivePrice,
        game_tick: tradeGameTick,
      },
      {
        resource_id: receiveResource,
        base_price: effectiveReceivePrice,
        game_tick: tradeGameTick,
      },
    ]);

  // Record player trade pressure so the market tick can move prices.
  // This is what closes the loop: trades affect prices, prices affect trades.
  try {
    await supabase.rpc('upsert_market_pressure', {
      p_user_id: auth.userId,
      p_resource: giveResource,
      p_buy_volume: 0,
      p_sell_volume: giveValue, // sell-pressure on what they gave
    });
    await supabase.rpc('upsert_market_pressure', {
      p_user_id: auth.userId,
      p_resource: receiveResource,
      p_buy_volume: giveValue, // buy-pressure on what they received
      p_sell_volume: 0,
    });
  } catch (pressureErr) {
    // Non-fatal: pressure recording is best-effort; trade already succeeded
    console.warn('[Trade] Failed to record market pressure:', pressureErr);
  }

  // ─── Phase 3 U1: fail-closed guard on all pricing values. ─────────────
  // Reject the entire trade if any pricing-derived number is non-finite
  // (NaN / Infinity / null-as-number from a dirty Supabase row).
  // Project rule C2: refuse to send garbage to client. Better to 503 the
  // trade than display NaN in the TradingPostPanel U1 post-trade row.
  const pricingFields = {
    giveBasePrice,
    receiveBasePrice,
    givePrice,
    receivePrice,
    effectiveGivePrice,
    effectiveReceivePrice,
    giveSlippage,
    receiveSlippage,
    finalReceiveAmount,
  };
  for (const [name, value] of Object.entries(pricingFields)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      console.error('[Trade] Pricing contains non-finite value — rejecting trade', {
        userId: auth.userId,
        field: name,
        value,
        giveResource,
        receiveResource,
        giveAmount,
      });
      return NextResponse.json(
        {
          error: 'Pricing data unavailable — please retry',
          code: 'PRICING_INVALID',
        },
        { status: 503 },
      );
    }
  }

  logActionAsync({
      userId: auth.userId,
      actionType: 'trade',
      payload: {
        giveResource,
        giveAmount,
        receiveResource,
        receiveAmount: finalReceiveAmount,
        commissionRate: getBalance().trade.commissionRate,
        source: 'server_authoritative_trade',
        livePriceUsed: true,
        slippage: { give: giveSlippage, receive: receiveSlippage },
      },
    // Validated above (tradeGameTick is guaranteed a finite non-negative
    // integer). Per RULES.md [SEC-011] / logActionAsync strict validation,
    // passing `Number(...)` directly is correct — no `|| 0` silent fallback.
    gameTick: tradeGameTick,
    // Pre-trade money from server state. If invalid, logActionAsync will
    // warn + skip the audit row rather than silently writing 0.
    moneyAfter: Number(fullState.money),
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
    // Live-price transparency for the client UI
    pricing: {
      giveBasePrice,
      receiveBasePrice,
      giveLivePrice: givePrice,
      receiveLivePrice: receivePrice,
    },
    giveEffectivePrice: effectiveGivePrice,
    receiveEffectivePrice: effectiveReceivePrice,
    slippage: { give: giveSlippage, receive: receiveSlippage },
    usedLivePrice: livePriceMap.has(giveResource) || livePriceMap.has(receiveResource),
  });
}
