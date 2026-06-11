"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore, formatNumber } from "@/lib/game/store";
import { ResourceType } from "@/lib/game/types";
import { TRADE_COMMISSION_RATE } from "@/lib/game/tradeConstants";
import { INITIAL_MARKET, RESOURCE_META, TRADABLE_RESOURCE_IDS } from "@/lib/game/configCache";
import { GameIcon } from "@/components/game/shared/GameIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRightLeft,
  AlertTriangle,
  History,
  Zap,
  Info,
  Loader2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { MarketPriceChart } from "./TradingPostPanel/MarketPriceChart";

// ─── Server-enforced cooldown (mirrors src/app/api/game/trade/route.ts) ─────
const TRADE_COOLDOWN_SECONDS = 300;

// Quick trade presets
interface QuickTradePreset {
  give: ResourceType;
  giveAmount: number;
  receive: ResourceType;
  label: string;
}

const QUICK_TRADE_PRESETS: QuickTradePreset[] = [
  { give: "iron", giveAmount: 100, receive: "copper", label: "Iron → Copper" },
  { give: "coal", giveAmount: 50, receive: "oil", label: "Coal → Oil" },
  { give: "sand", giveAmount: 100, receive: "iron", label: "Sand → Iron" },
  { give: "copper", giveAmount: 50, receive: "iron", label: "Copper → Iron" },
  { give: "iron", giveAmount: 50, receive: "coal", label: "Iron → Coal" },
  { give: "oil", giveAmount: 20, receive: "lithium", label: "Oil → Lithium" },
];

// Trade history entry — synced from server
interface TradeHistoryEntry {
  id: string;
  giveResource: ResourceType;
  giveAmount: number;
  receiveResource: ResourceType;
  receiveAmount: number;
  tick: number;
  serverValidated: boolean;
  createdAt?: string;
}

// ─── Helper: get base price for a resource ────────────────────────────────────
function getBasePrice(resource: ResourceType): number {
  const marketEntry = INITIAL_MARKET.find((m) => m.resource === resource);
  return marketEntry?.basePrice ?? 1;
}

// ─── Helper: calculate receive amount ─────────────────────────────────────────
function calculateReceiveAmount(
  giveResource: ResourceType,
  giveAmount: number,
  receiveResource: ResourceType,
): number {
  const givePrice = getBasePrice(giveResource);
  const receivePrice = getBasePrice(receiveResource);
  if (receivePrice === 0) return 0;
  return (giveAmount * givePrice * (1 - TRADE_COMMISSION_RATE)) / receivePrice;
}

// ─── Helper: format exchange rate ─────────────────────────────────────────────
function formatExchangeRate(
  giveResource: ResourceType,
  receiveResource: ResourceType,
): string {
  const givePrice = getBasePrice(giveResource);
  const receivePrice = getBasePrice(receiveResource);
  if (receivePrice === 0 || givePrice === 0) return "N/A";
  const rate = (givePrice * (1 - TRADE_COMMISSION_RATE)) / receivePrice;
  if (rate >= 1) return rate.toFixed(2);
  return rate.toFixed(3);
}

// ─── Server-authoritative trade call ───────────────────────────────────────────
async function executeTradeOnServer(
  giveResource: ResourceType,
  giveAmount: number,
  receiveResource: ResourceType,
): Promise<{
  valid: boolean;
  error?: string;
  receiveAmount?: number;
  updatedResources?: Record<string, number>;
  serverValidated: boolean;
  retryAfter?: number;
  code?: string;
}> {
  try {
    const response = await fetch("/api/game/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        giveResource,
        giveAmount,
        receiveResource,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = (data as { code?: string }).code;
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter =
        code === "TRADE_COOLDOWN"
          ? Number(
              (data as { retryAfter?: number }).retryAfter ??
                retryAfterHeader ??
                TRADE_COOLDOWN_SECONDS,
            )
          : undefined;
      return {
        valid: false,
        error:
          (data as { error?: string }).error ??
          `Server rejected trade (${response.status})`,
        serverValidated: true,
        retryAfter,
        code,
      };
    }

    return {
      valid: !!(data as { valid?: boolean }).valid,
      error: (data as { error?: string }).error,
      receiveAmount: (data as { receiveAmount?: number }).receiveAmount,
      updatedResources: (data as { resources?: Record<string, number> })
        .resources,
      serverValidated: true,
    };
  } catch (err) {
    console.error("[Trade] Server request failed:", err);
    return {
      valid: false,
      error: "Trade failed: server unavailable",
      serverValidated: false,
    };
  }
}

// ─── Fetch trade history from server ──────────────────────────────────────────
async function fetchTradeHistory(limit = 20): Promise<TradeHistoryEntry[]> {
  try {
    const response = await fetch(`/api/game/trades?limit=${limit}`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.trades ?? []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      giveResource: t.giveResource as ResourceType,
      giveAmount: t.giveAmount as number,
      receiveResource: t.receiveResource as ResourceType,
      receiveAmount: t.receiveAmount as number,
      tick: t.tick as number,
      serverValidated: t.serverValidated as boolean,
      createdAt: t.createdAt as string,
    }));
  } catch {
    return [];
  }
}

// ─── Format time ago from ISO string ──────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TradingPostPanel() {
  // State for the exchange interface
  const [giveResource, setGiveResource] = useState<ResourceType>("iron");
  const [receiveResource, setReceiveResource] =
    useState<ResourceType>("copper");
  const [giveAmount, setGiveAmount] = useState<number>(100);
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryEntry[]>([]);
  const [lastTradeTick, setLastTradeTick] = useState<number>(0);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  // Mirrors server-enforced trade cooldown (TRADE_COOLDOWN_SECONDS)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownTick, setCooldownTick] = useState(0); // forces re-render every second
  const [lastTradeAt, setLastTradeAt] = useState<number | null>(null); // restored from server

  // Game store selectors (C5 FIX: proper selectors, not entire store)
  const resources = useGameStore((s) => s.resources);
  const resourceCapacity = useGameStore((s) => s.resourceCapacity);
  const gameTick = useGameStore((s) => s.gameTick);

  // ─── Load trade history from server on mount ────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoadingHistory(true);
      const serverTrades = await fetchTradeHistory(20);
      if (mounted && serverTrades.length > 0) {
        setTradeHistory(serverTrades);
      }
      setIsLoadingHistory(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ─── Tick cooldown every second to re-render countdown ─────────────────────
  useEffect(() => {
    if (cooldownUntil === null) return;
    if (Date.now() >= cooldownUntil) {
      setCooldownUntil(null);
      return;
    }
    const id = setInterval(() => {
      setCooldownTick((t) => t + 1);
      if (Date.now() >= (cooldownUntil ?? 0)) {
        setCooldownUntil(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // ─── Cooldown remaining (recomputes when tick or cooldownUntil changes) ───
  const cooldownMsRemaining = useMemo(() => {
    void cooldownTick; // dependency: trigger re-compute each tick
    if (cooldownUntil === null) return 0;
    return Math.max(0, cooldownUntil - Date.now());
  }, [cooldownUntil, cooldownTick]);

  const cooldownSecondsRemaining = Math.ceil(cooldownMsRemaining / 1000);
  const isInCooldown = cooldownMsRemaining > 0;
  const cooldownDisplay = useMemo(() => {
    if (cooldownSecondsRemaining >= 60) {
      const m = Math.floor(cooldownSecondsRemaining / 60);
      const s = cooldownSecondsRemaining % 60;
      return `${m}m ${s}s`;
    }
    return `${cooldownSecondsRemaining}s`;
  }, [cooldownSecondsRemaining]);

  // ─── Computed values ────────────────────────────────────────────────────────
  const receiveAmount = useMemo(
    () => calculateReceiveAmount(giveResource, giveAmount, receiveResource),
    [giveResource, giveAmount, receiveResource],
  );

  const giveResourceCurrent = resources[giveResource] ?? 0;
  const receiveResourceCurrent = resources[receiveResource] ?? 0;
  const receiveCapacity = resourceCapacity[receiveResource] ?? Infinity;

  const canTrade = useMemo(() => {
    if (giveAmount <= 0) return false;
    if (giveResourceCurrent < giveAmount) return false;
    if (giveResource === receiveResource) return false;
    if (receiveAmount <= 0) return false;
    if (
      receiveCapacity !== Infinity &&
      receiveResourceCurrent + receiveAmount > receiveCapacity
    )
      return false;
    if (isTrading) return false; // Don't allow double-trades
    if (isInCooldown) return false; // Server-enforced cooldown active
    return true;
  }, [
    giveAmount,
    giveResourceCurrent,
    giveResource,
    receiveResource,
    receiveAmount,
    receiveResourceCurrent,
    receiveCapacity,
    isTrading,
    isInCooldown,
  ]);

  // ─── Storage suggestions ────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const result: {
      resource: ResourceType;
      percent: number;
      suggestTradeFor: ResourceType;
    }[] = [];
    for (const res of TRADABLE_RESOURCE_IDS) {
      const current = resources[res] ?? 0;
      const capacity = resourceCapacity[res] ?? Infinity;
      if (capacity === Infinity || capacity === 0) continue;
      const percent = current / capacity;
      if (percent > 0.8) {
        let bestTarget: ResourceType | null = null;
        let lowestPercent = 1;
        for (const candidate of TRADABLE_RESOURCE_IDS) {
          if (candidate === res) continue;
          const cCurrent = resources[candidate] ?? 0;
          const cCapacity = resourceCapacity[candidate] ?? Infinity;
          if (cCapacity === Infinity || cCapacity === 0) continue;
          const cPercent = cCurrent / cCapacity;
          if (cPercent < lowestPercent && cPercent < 0.5) {
            lowestPercent = cPercent;
            bestTarget = candidate as ResourceType;
          }
        }
        if (bestTarget) {
          result.push({
            resource: res as ResourceType,
            percent,
            suggestTradeFor: bestTarget,
          });
        }
      }
    }
    return result.slice(0, 3);
  }, [resources, resourceCapacity]);

  // ─── Execute trade (C5 FIX: now goes through server validation) ──────────
  const executeTrade = useCallback(
    async (gRes: ResourceType, gAmt: number, rRes: ResourceType) => {
      const rAmt = calculateReceiveAmount(gRes, gAmt, rRes);
      if (rAmt <= 0) return;

      const state = useGameStore.getState();

      // Pre-flight client-side check
      if ((state.resources[gRes] ?? 0) < gAmt) {
        state.addNotification(
          "warning",
          `Not enough ${RESOURCE_META[gRes]?.name ?? gRes} for this trade`,
        );
        return;
      }

      setIsTrading(true);
      setTradeError(null);

      try {
        const serverResult = await executeTradeOnServer(gRes, gAmt, rRes);

        if (serverResult.code === "TRADE_COOLDOWN" && serverResult.retryAfter) {
          // Server enforced cooldown — start client countdown
          setCooldownUntil(Date.now() + serverResult.retryAfter * 1000);
          setTradeError(
            `Cooldown active. Wait ${serverResult.retryAfter}s before trading again.`,
          );
          state.addNotification(
            "warning",
            `Trade on cooldown — try again in ${serverResult.retryAfter}s`,
          );
          return;
        }

        if (!serverResult.valid || !serverResult.updatedResources) {
          setTradeError(serverResult.error ?? "Trade rejected by server");
          state.addNotification(
            "error",
            `Trade rejected: ${serverResult.error ?? "validation failed"}`,
          );
          return;
        }

        const finalReceiveAmount = serverResult.receiveAmount ?? rAmt;
        const currentState = useGameStore.getState();

        // Apply server-authoritative resources directly
        useGameStore.setState({ resources: serverResult.updatedResources });
        currentState.addNotification(
          "success",
          `Traded ${formatNumber(gAmt)} ${RESOURCE_META[gRes]?.name ?? gRes} for ${finalReceiveAmount.toFixed(1)} ${RESOURCE_META[rRes]?.name ?? rRes}`,
        );

        const entry: TradeHistoryEntry = {
          id: crypto.randomUUID(),
          giveResource: gRes,
          giveAmount: gAmt,
          receiveResource: rRes,
          receiveAmount: finalReceiveAmount,
          tick: currentState.gameTick,
          serverValidated: serverResult.serverValidated,
        };
        setTradeHistory((prev) => [entry, ...prev].slice(0, 50));
        setLastTradeTick(currentState.gameTick);
        // Start client cooldown (mirrors server enforcement)
        const tradeTs = Date.now();
        setLastTradeAt(tradeTs);
        setCooldownUntil(tradeTs + TRADE_COOLDOWN_SECONDS * 1000);
      } catch (err) {
        console.error("[Trade] Unexpected error:", err);
        setTradeError("Unexpected error during trade");
        state.addNotification(
          "error",
          "Trade failed due to an unexpected error",
        );
      } finally {
        setIsTrading(false);
      }
    },
    [],
  );

  const handleExecuteTrade = useCallback(() => {
    if (!canTrade) return;
    executeTrade(giveResource, giveAmount, receiveResource);
  }, [canTrade, giveResource, giveAmount, receiveResource, executeTrade]);

  const handleQuickTrade = useCallback(
    (preset: QuickTradePreset) => {
      if (isInCooldown) {
        useGameStore
          .getState()
          .addNotification(
            "warning",
            `Trade on cooldown — wait ${cooldownSecondsRemaining}s`,
          );
        return;
      }
      const state = useGameStore.getState();
      if ((state.resources[preset.give] ?? 0) < preset.giveAmount) {
        state.addNotification(
          "warning",
          `Not enough ${RESOURCE_META[preset.give]?.name ?? preset.give} for this trade`,
        );
        return;
      }
      executeTrade(preset.give, preset.giveAmount, preset.receive);
    },
    [executeTrade, isInCooldown, cooldownSecondsRemaining],
  );

  // Quick trade: calculate receive amounts
  const quickTradeAmounts = useMemo(() => {
    return QUICK_TRADE_PRESETS.map((p) => ({
      ...p,
      receiveAmount: calculateReceiveAmount(p.give, p.giveAmount, p.receive),
    }));
  }, []);

  // ─── Set amount to max available ────────────────────────────────────────────
  const setMaxGive = useCallback(() => {
    setGiveAmount(Math.floor(giveResourceCurrent));
  }, [giveResourceCurrent]);

  // ─── Swap give/receive ─────────────────────────────────────────────────────
  const swapResources = useCallback(() => {
    setGiveResource(receiveResource);
    setReceiveResource(giveResource);
    setGiveAmount(
      Math.min(giveAmount, Math.floor(resources[receiveResource] ?? 0)),
    );
  }, [giveResource, receiveResource, giveAmount, resources]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-research" />
          <h2 className="text-xl font-bold text-brand neon-glow-cyan">
            Trading Post
          </h2>
          <Badge
            variant="outline"
            className="text-[10px] border-violet-500/30 text-research bg-violet-900/20"
          >
            15% commission
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] border-success/30 text-success bg-success/20"
          >
            ✓ Server-validated
          </Badge>
        </div>
        <div className="text-xs text-muted-label">
          Exchange resources directly — validated by server
        </div>
      </div>

      {/* ─── Resource Exchange Interface ──────────────────────────────────── */}
      <div className="bg-card border border-brand/20 rounded-xl p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          {/* GIVE side */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-label">
              Give
            </div>
            <Select
              value={giveResource}
              onValueChange={(val) => {
                setGiveResource(val as ResourceType);
                if (val === receiveResource) {
                  setReceiveResource(giveResource);
                }
              }}
            >
              <SelectTrigger className="w-full bg-[#0a0e17] border-brand/30 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1220] border-brand/30 max-h-60">
                {TRADABLE_RESOURCE_IDS.map((res) => (
                  <SelectItem key={res} value={res} className="text-sm">
                    <span className="flex items-center gap-2">
                      <GameIcon
                        icon={RESOURCE_META[res]?.icon}
                        size={14}
                        className="inline-flex"
                      />
                      <span>{RESOURCE_META[res]?.name ?? res}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-label">Amount</label>
                <button
                  className="text-[10px] text-research hover:text-research transition-colors"
                  onClick={setMaxGive}
                >
                  Max: {formatNumber(giveResourceCurrent)}
                </button>
              </div>
              <input
                type="number"
                min={0}
                max={Math.floor(giveResourceCurrent)}
                value={giveAmount}
                onChange={(e) =>
                  setGiveAmount(Math.max(0, parseInt(e.target.value) || 0))
                }
                className="w-full bg-[#0a0e17] border border-brand/30 rounded-md px-3 py-2 text-sm font-mono text-brand focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-colors"
              />
            </div>

            {/* Available indicator */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <GameIcon
                icon={RESOURCE_META[giveResource]?.icon}
                size={12}
                className="inline-flex"
              />
              <span className="text-muted-label">Available:</span>
              <span
                className={`font-mono ${giveResourceCurrent >= giveAmount ? "text-success" : "text-danger"}`}
              >
                {formatNumber(giveResourceCurrent)}
              </span>
            </div>
          </div>

          {/* Swap button */}
          <div className="flex items-center justify-center sm:pt-6">
            <motion.button
              whileHover={{ rotate: 180, scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.3 }}
              onClick={swapResources}
              className="w-10 h-10 rounded-full border border-violet-500/30 bg-violet-900/20 flex items-center justify-center text-research hover:bg-violet-900/40 hover:border-violet-500/50 transition-colors"
              aria-label="Swap give and receive resources"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </motion.button>
          </div>

          {/* RECEIVE side */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-label">
              Receive
            </div>
            <Select
              value={receiveResource}
              onValueChange={(val) => {
                setReceiveResource(val as ResourceType);
                if (val === giveResource) {
                  setGiveResource(receiveResource);
                }
              }}
            >
              <SelectTrigger className="w-full bg-[#0a0e17] border-brand/30 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d1220] border-brand/30 max-h-60">
                {TRADABLE_RESOURCE_IDS.map((res) => (
                  <SelectItem key={res} value={res} className="text-sm">
                    <span className="flex items-center gap-2">
                      <GameIcon
                        icon={RESOURCE_META[res]?.icon}
                        size={14}
                        className="inline-flex"
                      />
                      <span>{RESOURCE_META[res]?.name ?? res}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-1">
              <div className="text-[10px] text-muted-label">You will receive</div>
              <div className="bg-[#0a0e17] border border-brand/30 rounded-md px-3 py-2 text-sm font-mono text-research">
                {giveResource !== receiveResource
                  ? receiveAmount > 0
                    ? receiveAmount.toFixed(2)
                    : "0"
                  : "—"}
              </div>
            </div>

            {/* Capacity indicator */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <GameIcon
                icon={RESOURCE_META[receiveResource]?.icon}
                size={12}
                className="inline-flex"
              />
              <span className="text-muted-label">Storage:</span>
              <span
                className={`font-mono ${
                  receiveCapacity !== Infinity &&
                  receiveResourceCurrent + receiveAmount > receiveCapacity
                    ? "text-danger"
                    : "text-subtle"
                }`}
              >
                {formatNumber(receiveResourceCurrent)} /{" "}
                {receiveCapacity === Infinity
                  ? "∞"
                  : formatNumber(receiveCapacity)}
              </span>
              {receiveCapacity !== Infinity && (
                <div className="w-12 h-1 bg-muted-label rounded-full overflow-hidden ml-1">
                  <div
                    className={`h-full rounded-full transition-all ${
                      receiveResourceCurrent / receiveCapacity > 0.8
                        ? "bg-danger"
                        : receiveResourceCurrent / receiveCapacity > 0.5
                          ? "bg-warning"
                          : "bg-success"
                    }`}
                    style={{
                      width: `${Math.min(100, (receiveResourceCurrent / receiveCapacity) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rate info + Execute button */}
        <div className="mt-4 pt-4 border-t border-brand/20 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-label">
            <span>
              Rate:{" "}
              <span className="text-brand font-mono">
                1 {RESOURCE_META[giveResource]?.name ?? giveResource} ={" "}
                {formatExchangeRate(giveResource, receiveResource)}{" "}
                {RESOURCE_META[receiveResource]?.name ?? receiveResource}
              </span>
            </span>
            <span>
              Commission:{" "}
              <span className="text-research">
                {(TRADE_COMMISSION_RATE * 100).toFixed(0)}%
              </span>
            </span>
            <span className="flex items-center gap-1 text-success">
              <Info className="w-3 h-3" />
              Server-validated
            </span>
          </div>

          {/* Trade error display */}
          {tradeError && (
            <div className="flex items-center gap-2 text-[10px] text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {tradeError}
            </div>
          )}

          {/* Insufficient resources warning */}
          {giveResourceCurrent < giveAmount && giveAmount > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              Not enough {RESOURCE_META[giveResource]?.name ?? giveResource}.
              You have {formatNumber(giveResourceCurrent)} but need{" "}
              {formatNumber(giveAmount)}.
            </div>
          )}

          {/* Capacity overflow warning */}
          {receiveCapacity !== Infinity &&
            receiveResourceCurrent + receiveAmount > receiveCapacity &&
            receiveAmount > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-warning bg-yellow-900/10 border border-warning/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                {RESOURCE_META[receiveResource]?.name ?? receiveResource}{" "}
                storage would overflow. Receive amount will be capped.
              </div>
            )}

          {isInCooldown && (
            <div className="flex items-center gap-2 text-[10px] text-brand bg-brand/10 border border-brand/20 rounded-lg px-3 py-2 font-mono">
              <Clock className="w-3 h-3 flex-shrink-0 animate-pulse" />
              Trade cooldown — wait {cooldownDisplay}
              <span className="ml-auto h-1.5 w-24 bg-brand/30 rounded-full overflow-hidden">
                <span
                  className="block h-full bg-brand transition-all duration-1000 ease-linear"
                  style={{
                    width: `${
                      (cooldownMsRemaining / (TRADE_COOLDOWN_SECONDS * 1000)) * 100
                    }%`,
                  }}
                />
              </span>
            </div>
          )}

          <Button
            onClick={handleExecuteTrade}
            disabled={!canTrade}
            className="w-full sm:w-auto bg-violet-600 hover:bg-violet-500 text-white border-0 disabled:opacity-40"
            size="sm"
          >
            {isTrading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Validating...
              </>
            ) : isInCooldown ? (
              <>
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                Wait {cooldownDisplay}
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Execute Trade
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ─── Price History Chart ─────────────────────────────────────────── */}
      <div className="bg-card border border-brand/20 rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-subtle flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-research" />
            Price History —{" "}
            <span className="text-brand">
              {RESOURCE_META[giveResource]?.name ?? giveResource}
            </span>
          </h3>
          <div className="flex items-center gap-2 text-[10px] text-muted-label">
            <span className="font-mono">
              {formatExchangeRate(giveResource, receiveResource)} per unit
            </span>
            <span className="text-dim">|</span>
            <span>showing 24h</span>
          </div>
        </div>
        <MarketPriceChart
          resourceId={giveResource}
          hours={24}
          width={7600}
          height={120}
          className="w-full"
        />
      </div>

      {/* ─── Quick Trade Presets ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-subtle flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-research" />
          Quick Trades
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {quickTradeAmounts.map((preset, idx) => {
            const hasEnough =
              (resources[preset.give] ?? 0) >= preset.giveAmount;
            const canClick = hasEnough && !isTrading && !isInCooldown;
            return (
              <motion.button
                key={idx}
                whileHover={{ scale: canClick ? 1.03 : 1 }}
                whileTap={{ scale: canClick ? 0.97 : 1 }}
                onClick={() => handleQuickTrade(preset)}
                disabled={!canClick}
                className={`bg-card border rounded-lg p-3 text-center transition-colors ${
                  canClick
                    ? "border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-900/10 cursor-pointer"
                    : "border-brand/10 opacity-40 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-xs">
                  <GameIcon
                    icon={RESOURCE_META[preset.give]?.icon}
                    size={14}
                    className="inline-flex"
                  />
                  <span className="font-mono text-brand">
                    {preset.giveAmount}
                  </span>
                </div>
                <ArrowRightLeft className="w-3 h-3 text-research mx-auto my-1" />
                <div className="flex items-center justify-center gap-1 text-xs">
                  <GameIcon
                    icon={RESOURCE_META[preset.receive]?.icon}
                    size={14}
                    className="inline-flex"
                  />
                  <span className="font-mono text-research">
                    {preset.receiveAmount.toFixed(1)}
                  </span>
                </div>
                {isInCooldown && hasEnough && (
                  <div className="mt-1 text-[9px] font-mono text-brand flex items-center justify-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {cooldownDisplay}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ─── Storage Suggestions ──────────────────────────────────────────── */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-2"
          >
            <h3 className="text-sm font-semibold text-subtle flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              Storage Suggestions
            </h3>
            <div className="space-y-1.5">
              {suggestions.map((s, idx) => (
                <motion.div
                  key={s.resource}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-3 bg-yellow-900/10 border border-warning/20 rounded-lg px-3 py-2"
                >
                  <AlertTriangle className="w-3 h-3 text-warning flex-shrink-0" />
                  <div className="flex-1 text-xs">
                    <span className="text-warning">
                      {RESOURCE_META[s.resource]?.name ?? s.resource}
                    </span>
                    <span className="text-subtle"> storage is </span>
                    <span className="text-warning font-mono">
                      {(s.percent * 100).toFixed(0)}%
                    </span>
                    <span className="text-subtle">
                      {" "}
                      full — consider trading for{" "}
                    </span>
                    <span className="text-research">
                      {RESOURCE_META[s.suggestTradeFor]?.name ??
                        s.suggestTradeFor}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 border-violet-500/30 text-research hover:bg-violet-900/20 flex-shrink-0"
                    onClick={() => {
                      setGiveResource(s.resource);
                      setReceiveResource(s.suggestTradeFor);
                      setGiveAmount(Math.floor(resources[s.resource] * 0.2));
                    }}
                  >
                    Set Trade
                  </Button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Recent Trades (persisted to server) ──────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-subtle flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-subtle" />
          Recent Trades
          {tradeHistory.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] border-brand/30 text-brand bg-brand/20 ml-1"
            >
              {tradeHistory.length}
            </Badge>
          )}
          {isLoadingHistory && (
            <Loader2 className="w-3 h-3 text-muted-label animate-spin" />
          )}
        </h3>
        {tradeHistory.length === 0 ? (
          <div className="bg-card border border-brand/20 rounded-lg p-4 text-center text-muted-label text-xs">
            {isLoadingHistory
              ? "Loading trade history..."
              : "No trades yet. Exchange resources to get started!"}
          </div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto game-scrollbar">
            {tradeHistory.map((entry) => {
              const ticksAgo = gameTick - entry.tick;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-brand/20 rounded-lg px-3 py-2 flex items-center gap-2 text-xs"
                >
                  <GameIcon
                    icon={RESOURCE_META[entry.giveResource]?.icon}
                    size={12}
                    className="inline-flex text-subtle"
                  />
                  <span className="font-mono text-brand">
                    {formatNumber(entry.giveAmount)}
                  </span>
                  <span className="text-muted-label">
                    {RESOURCE_META[entry.giveResource]?.name ??
                      entry.giveResource}
                  </span>
                  <ArrowRightLeft className="w-3 h-3 text-research" />
                  <GameIcon
                    icon={RESOURCE_META[entry.receiveResource]?.icon}
                    size={12}
                    className="inline-flex text-subtle"
                  />
                  <span className="font-mono text-research">
                    {entry.receiveAmount.toFixed(1)}
                  </span>
                  <span className="text-muted-label">
                    {RESOURCE_META[entry.receiveResource]?.name ??
                      entry.receiveResource}
                  </span>
                  {entry.serverValidated ? (
                    <span
                      className="text-[8px] text-success ml-1"
                      title="Server-validated"
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      className="text-[8px] text-warning ml-1"
                      title="Optimistic (not server-validated)"
                    >
                      ⚠
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-label flex-shrink-0">
                    {entry.createdAt
                      ? timeAgo(entry.createdAt)
                      : ticksAgo === 0
                        ? "just now"
                        : `${ticksAgo} ticks ago`}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Info Card ────────────────────────────────────────────────────── */}
      <div className="bg-card border border-brand/20 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-label mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-muted-label space-y-1">
            <p>
              <span className="text-subtle font-semibold">How it works:</span>{" "}
              The Trading Post lets you exchange resources directly without
              using money. Exchange rates are based on base market values with a{" "}
              {(TRADE_COMMISSION_RATE * 100).toFixed(0)}% commission.
            </p>
            <p>
              <span className="text-success font-semibold">Security:</span>{" "}
              All trades are executed server-side against authoritative state to
              prevent client-side tampering. Trades are persisted to your
              history and survive page refreshes.
            </p>
            <p>
              <span className="text-subtle font-semibold">Tip:</span> Selling
              resources on the Market and buying others is more efficient, but
              the Trading Post is instant and convenient when you need a quick
              conversion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TradingPostPanel;
