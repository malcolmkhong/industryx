/* eslint-disable jsx-a11y/control-has-associated-label */
"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/admin/UserAvatar";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ArrowLeft, ChevronDown, ChevronUp, Lock, Unlock, Database, Ban, ShieldCheck } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface GameState {
  user_id: string;
  display_name: string | null;
  money: number;
  total_earned: number;
  research_points: number;
  game_tick: number;
  game_speed: number;
  buildings: Record<string, unknown> | unknown[] | null;
  is_locked: boolean;
  lock_reason: string | null;
  full_state: Record<string, unknown> | null;
  last_saved_at: string | null;
  created_at: string | null;
  [key: string]: unknown;
}

interface PlayerAction {
  id: string;
  action_type: string;
  money_after: number | null;
  is_valid: boolean;
  risk_level: string | null;
  rejection_reason: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface Investigation {
  id: string;
  detection_type: string;
  severity: string;
  description: string | null;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

interface PlayerDetail {
  user_id: string;
  email: string | null;
  display_name: string | null;
  game_state: GameState;
  progress: Record<string, unknown> | null;
  recent_actions: PlayerAction[];
  investigations: Investigation[];
}

interface AuthUserEnriched {
  id: string;
  email?: string;
  is_anonymous?: boolean;
  provider?: string;
  providers?: string[];
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  banned_until?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncateUid(uid: string, max = 8): string {
  if (uid.length <= max * 2 + 3) return uid;
  return uid.slice(0, max) + "..." + uid.slice(-4);
}

function formatMoney(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + "B";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString();
}

function getSeverityBadgeClasses(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-danger/15 text-danger border-danger/20";
    case "high":
      return "bg-domain/60/15 text-domain border-domain/20";
    case "medium":
      return "bg-warning/60/15 text-warning border-warning/60/20";
    case "low":
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
    default:
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
  }
}

function getInvestigationStatusBadge(status: string): string {
  switch (status) {
    case "open":
      return "bg-domain/60/15 text-domain border-domain/20";
    case "resolved":
      return "bg-success/15 text-success border-success/20";
    case "dismissed":
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
    default:
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
  }
}

function getRiskLevelBadge(risk: string | null): string {
  if (!risk) return "";
  switch (risk) {
    case "high":
      return "bg-danger/15 text-danger border-danger/20";
    case "medium":
      return "bg-warning/60/15 text-warning border-warning/60/20";
    case "low":
      return "bg-success/15 text-success border-success/20";
    default:
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
  }
}

function countBuildings(buildings: Record<string, unknown> | unknown[] | null): number {
  if (!buildings) return 0;
  if (Array.isArray(buildings)) return buildings.length;
  if (typeof buildings === "object") {
    if (typeof (buildings as Record<string, unknown>).count === "number") {
      return (buildings as Record<string, unknown>).count as number;
    }
    return Object.keys(buildings).length;
  }
  return 0;
}

function providerLabel(provider: string): string {
  const known: Record<string, string> = {
    google: "Google",
    github: "GitHub",
    email: "Email",
    azure: "Azure",
    apple: "Apple",
    facebook: "Facebook",
    twitter: "Twitter / X",
    discord: "Discord",
  };
  return known[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "just now";
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (diffMs < 3_600_000) return fmt.format(-Math.round(diffMs / 60_000), "minute");
  if (diffMs < 86_400_000) return fmt.format(-Math.round(diffMs / 3_600_000), "hour");
  if (diffMs < 30 * 86_400_000) return fmt.format(-Math.round(diffMs / 86_400_000), "day");
  if (diffMs < 365 * 86_400_000) return fmt.format(-Math.round(diffMs / (30 * 86_400_000)), "month");
  return fmt.format(-Math.round(diffMs / (365 * 86_400_000)), "year");
}

// ─── Component ────────────────────────────────────────────────────────────

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = use(params);

  // Data
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserEnriched | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  // Lock/Unlock modal
  const [confirmModal, setConfirmModal] = useState<{ action: "lock" | "unlock" } | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // JSONB viewer
  const [jsonExpanded, setJsonExpanded] = useState(false);

  // Error display
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }, []);

  // ─── Fetch player ───────────────────────────────────────────────────────

  const fetchPlayer = useCallback(async () => {
    try {
      setDataLoading(true);
      const res = await fetch(`/api/admin/players/${playerId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch player");
      }
      const data = await res.json();
      setPlayer(data.data || null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load player");
    } finally {
      setDataLoading(false);
    }
  }, [playerId, showError]);

  useEffect(() => {
    fetchPlayer();
  }, [fetchPlayer]);

  // ─── Fetch auth (independent — non-blocking if 404) ─────────────────────

  const fetchAuth = useCallback(async () => {
    try {
      setAuthLoading(true);
      const res = await fetch(`/api/admin/players/${playerId}/auth`);
      if (!res.ok) {
        // 404 = no auth row (data integrity edge case). Don't show error.
        setAuthUser(null);
        return;
      }
      const data = await res.json();
      setAuthUser(data.data || null);
    } catch {
      setAuthUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    fetchAuth();
  }, [fetchAuth]);

  // ─── Lock/Unlock handler ────────────────────────────────────────────────

  const handleLockAction = async () => {
    if (!confirmModal) return;
    const locked = confirmModal.action === "lock";

    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/players/${playerId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked, reason: locked ? lockReason || undefined : undefined }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || `Failed to ${locked ? "lock" : "unlock"} account`);
      }
      showSuccess(`Account ${locked ? "locked" : "unlocked"} successfully`);
      setConfirmModal(null);
      setLockReason("");
      fetchPlayer();
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to ${locked ? "lock" : "unlock"} account`);
    } finally {
      setActionLoading(false);
    }
  };

  // ─── JSONB viewer ──────────────────────────────────────────────────────

  const getJsonLines = (): Array<{ lineNumber: number; content: string }> => {
    if (!player?.game_state?.full_state) return [];
    try {
      return JSON.stringify(player.game_state.full_state, null, 2)
        .split("\n")
        .map((content, lineNumber) => ({ lineNumber: lineNumber + 1, content }));
    } catch {
      return [{ lineNumber: 1, content: "[Error rendering JSON]" }];
    }
  };

  const jsonLines = getJsonLines();
  const displayLines = jsonExpanded ? jsonLines : jsonLines.slice(0, 20);
  const hasMoreLines = jsonLines.length > 20;

  // ─── Not found ──────────────────────────────────────────────────────────

  if (!dataLoading && !player) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Ban size={48} strokeWidth={1.5} className="text-muted-label/80" />
          <p className="text-muted-label text-sm">Player not found</p>
          <Link href="/admin/players" className="inline-flex items-center gap-2 px-4 py-2 bg-warning/60/10 text-warning text-sm rounded-lg hover:bg-warning/60/20 transition-colors border border-warning/60/20">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to Players
          </Link>
        </div>
      </div>
    );
  }

  // ─── Derive computed values ─────────────────────────────────────────────

  const gameState = player?.game_state;
  const isLocked = gameState?.is_locked ?? false;
  const buildingsCount = gameState ? countBuildings(gameState.buildings) : 0;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Notification banners */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/15 text-danger border border-danger/20 text-sm font-medium">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-success/15 text-success border border-success/20 text-sm font-medium">
          {successMsg}
        </div>
      )}

      <div className="max-w-5xl">
        {/* Back button */}
        <Link
          href="/admin/players"
          className="inline-flex items-center gap-2 text-muted-label hover:text-warning text-sm transition-colors mb-4"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Players
        </Link>

        {dataLoading ? (
          <div className="space-y-4">
            <div className="h-32 bg-background/60/50 rounded-xl animate-pulse" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-background/60/50 rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="h-48 bg-background/60/50 rounded-xl animate-pulse" />
          </div>
        ) : player ? (
          <>
            {/* Player Header Card */}
            <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5 sm:p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <UserAvatar
                    avatarUrl={authUser?.avatar_url ?? null}
                    email={player.email}
                    displayName={player.display_name}
                    size={56}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-white text-lg font-bold">
                        {player.display_name || "Unknown Player"}
                      </h2>
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-danger/15 text-danger border-danger/20">
                          <Lock size={14} />
                          Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-success/15 text-success border-success/20">
                          Active
                        </span>
                      )}
                      {authUser?.is_anonymous && (
                        <StatusBadge variant="neutral">Guest</StatusBadge>
                      )}
                      {authUser?.provider && !authUser.is_anonymous && (
                        <StatusBadge variant="info">{providerLabel(authUser.provider)}</StatusBadge>
                      )}
                      {authUser?.banned_until && (
                        <StatusBadge variant="danger">Banned</StatusBadge>
                      )}
                      {authUser && authUser.email_confirmed_at === null && (
                        <StatusBadge variant="warning">Email Unverified</StatusBadge>
                      )}
                    </div>
                    {authUser?.full_name && authUser.full_name !== player.display_name && (
                      <p className="text-white text-sm mt-1">{authUser.full_name}</p>
                    )}
                    <p className="text-muted-label text-sm mt-1">
                      {player.email || (authUser?.is_anonymous ? "Guest (no email)" : "No email")}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <code className="text-muted-label text-[10px] font-mono">
                        ID: {truncateUid(player.user_id, 12)}
                      </code>
                      <span className="text-muted-label/80 text-[10px]">
                        Joined {gameState?.created_at ? new Date(gameState.created_at).toLocaleDateString() : "—"}
                      </span>
                      {!authLoading && authUser?.last_sign_in_at && (
                        <span
                          className="text-muted-label/80 text-[10px]"
                          title={authUser.last_sign_in_at}
                        >
                          Last sign-in {formatRelative(authUser.last_sign_in_at)}
                        </span>
                      )}
                      {!authLoading && authUser && !authUser.last_sign_in_at && (
                        <span className="text-muted-label/80 text-[10px]">
                          Last sign-in: never
                        </span>
                      )}
                    </div>
                    {isLocked && gameState?.lock_reason && (
                      <div className="mt-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                        <p className="text-danger text-xs">
                          <span className="font-medium">Lock reason:</span> {gameState.lock_reason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 shrink-0">
                  {isLocked ? (
                    <button
                      onClick={() => setConfirmModal({ action: "unlock" })}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-success/10 text-success text-sm rounded-lg hover:bg-success/20 transition-colors border border-success/20 font-medium"
                    >
                      <Unlock size={14} />
                      Unlock Account
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmModal({ action: "lock" })}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger text-sm rounded-lg hover:bg-danger/20 transition-colors border border-danger/20 font-medium"
                    >
                      <Lock size={14} />
                      Lock Account
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4">
                <p className="text-muted-label text-[10px] mb-1">Money</p>
                <p className="text-success text-sm font-bold font-mono">
                  ${formatMoney(gameState?.money ?? 0)}
                </p>
              </div>
              <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4">
                <p className="text-muted-label text-[10px] mb-1">Total Earned</p>
                <p className="text-success text-sm font-bold font-mono">
                  ${formatMoney((gameState?.total_earned as number) ?? 0)}
                </p>
              </div>
              <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4">
                <p className="text-muted-label text-[10px] mb-1">Research Pts</p>
                <p className="text-warning text-sm font-bold font-mono">
                  {((gameState?.research_points as number) ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4">
                <p className="text-muted-label text-[10px] mb-1">Buildings</p>
                <p className="text-white text-sm font-bold">{buildingsCount}</p>
              </div>
              <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4">
                <p className="text-muted-label text-[10px] mb-1">Game Tick</p>
                <p className="text-white text-sm font-bold font-mono">
                  {(gameState?.game_tick ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4">
                <p className="text-muted-label text-[10px] mb-1">Game Speed</p>
                <p className="text-white text-sm font-bold font-mono">
                  {((gameState?.game_speed as number) ?? 1)}x
                </p>
              </div>
            </div>

            {/* Game State Viewer */}
            {jsonLines.length > 0 && (
              <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden mb-6">
                <button
                  onClick={() => setJsonExpanded(!jsonExpanded)}
                  className="w-full flex items-center justify-between px-5 py-3 border-b border-muted-label/40 hover:bg-background/60/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Database size={18} />
                    <span className="text-white text-sm font-medium">Game State (JSONB)</span>
                    <span className="text-muted-label text-[10px]">{jsonLines.length} lines</span>
                  </div>
                  {jsonExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <div className="p-4 overflow-x-auto max-h-96 overflow-y-auto">
                  <pre className="text-muted-label text-xs font-mono leading-relaxed">
                    {displayLines.map((line) => (
                      <div key={line.lineNumber} className="hover:bg-background/60/30 px-2 -mx-2">
                        <span className="text-muted-label/80 select-none mr-4 inline-block w-8 text-right">{line.lineNumber}</span>
                        {line.content}
                      </div>
                    ))}
                  </pre>
                  {hasMoreLines && !jsonExpanded && (
                    <div className="relative">
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-linear-to-t from-background/80/60 to-transparent pointer-events-none" />
                    </div>
                  )}
                </div>
                {hasMoreLines && !jsonExpanded && (
                  <div className="px-5 py-3 border-t border-muted-label/40">
                    <button
                      onClick={() => setJsonExpanded(true)}
                      className="text-warning text-xs hover:text-warning/80 transition-colors"
                    >
                      Expand all ({jsonLines.length} lines)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Recent Actions Table */}
            <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-muted-label/40">
                <h3 className="text-white text-sm font-medium">Recent Actions</h3>
                <p className="text-muted-label text-[10px] mt-0.5">Last {player.recent_actions?.length ?? 0} actions</p>
              </div>
              {!player.recent_actions || player.recent_actions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-muted-label text-sm">No actions recorded</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-muted-label/40">
                          <th className="px-4 py-2.5 text-left text-xs text-muted-label font-medium">Time</th>
                          <th className="px-4 py-2.5 text-left text-xs text-muted-label font-medium">Action</th>
                          <th className="px-4 py-2.5 text-right text-xs text-muted-label font-medium">Money After</th>
                          <th className="px-4 py-2.5 text-center text-xs text-muted-label font-medium">Valid</th>
                          <th className="px-4 py-2.5 text-center text-xs text-muted-label font-medium">Risk</th>
                          <th className="px-4 py-2.5 text-left text-xs text-muted-label font-medium">Rejection</th>
                        </tr>
                      </thead>
                      <tbody>
                        {player.recent_actions.map((action) => (
                          <tr key={action.id} className="border-b border-muted-label/40/50 hover:bg-background/60/30 transition-colors">
                            <td className="px-4 py-2.5">
                              <span className="text-muted-label text-xs">
                                {new Date(action.created_at).toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <code className="text-subtle text-xs font-mono">{action.action_type}</code>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-success text-xs font-mono">
                                {action.money_after != null ? `$${formatMoney(action.money_after)}` : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {action.is_valid ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-success/15 text-success border-success/20">
                                  Valid
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-danger/15 text-danger border-danger/20">
                                  Invalid
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {action.risk_level ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getRiskLevelBadge(action.risk_level)}`}>
                                  {action.risk_level}
                                </span>
                              ) : (
                                <span className="text-muted-label/80 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-muted-label text-xs truncate block max-w-50">
                                {action.rejection_reason || "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-background/60/50">
                    {player.recent_actions.map((action) => (
                      <div key={action.id} className="p-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <code className="text-subtle text-xs font-mono">{action.action_type}</code>
                          {action.is_valid ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-success/15 text-success border-success/20">
                              Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-danger/15 text-danger border-danger/20">
                              Invalid
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-muted-label text-[10px]">
                            {new Date(action.created_at).toLocaleString()}
                          </span>
                          {action.money_after != null && (
                            <span className="text-success text-[10px] font-mono">
                              ${formatMoney(action.money_after)}
                            </span>
                          )}
                          {action.risk_level && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${getRiskLevelBadge(action.risk_level)}`}>
                              {action.risk_level}
                            </span>
                          )}
                        </div>
                        {action.rejection_reason && (
                          <p className="text-danger/70 text-[10px] mt-1">{action.rejection_reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Investigations Table */}
            <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-muted-label/40">
                <h3 className="text-white text-sm font-medium">Cheat Investigations</h3>
                <p className="text-muted-label text-[10px] mt-0.5">{player.investigations?.length ?? 0} investigation{(player.investigations?.length ?? 0) !== 1 ? "s" : ""}</p>
              </div>
              {!player.investigations || player.investigations.length === 0 ? (
                <div className="p-8 text-center">
                  <ShieldCheck size={32} strokeWidth={1.5} className="text-muted-label/80 mx-auto mb-2" />
                  <p className="text-muted-label text-sm">No investigations</p>
                  <p className="text-muted-label/80 text-xs">This player has a clean record</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-muted-label/40">
                          <th className="px-4 py-2.5 text-left text-xs text-muted-label font-medium">Detection Type</th>
                          <th className="px-4 py-2.5 text-center text-xs text-muted-label font-medium">Severity</th>
                          <th className="px-4 py-2.5 text-left text-xs text-muted-label font-medium">Description</th>
                          <th className="px-4 py-2.5 text-center text-xs text-muted-label font-medium">Status</th>
                          <th className="px-4 py-2.5 text-right text-xs text-muted-label font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {player.investigations.map((inv) => (
                          <tr key={inv.id} className="border-b border-muted-label/40/50 hover:bg-background/60/30 transition-colors">
                            <td className="px-4 py-2.5">
                              <code className="text-subtle text-xs font-mono">{inv.detection_type}</code>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getSeverityBadgeClasses(inv.severity)}`}>
                                {inv.severity}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-muted-label text-xs truncate block max-w-75">
                                {inv.description || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getInvestigationStatusBadge(inv.status)}`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-muted-label text-xs">
                                {new Date(inv.created_at).toLocaleDateString()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-background/60/50">
                    {player.investigations.map((inv) => (
                      <div key={inv.id} className="p-4">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <code className="text-subtle text-xs font-mono">{inv.detection_type}</code>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${getSeverityBadgeClasses(inv.severity)}`}>
                            {inv.severity}
                          </span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${getInvestigationStatusBadge(inv.status)}`}>
                            {inv.status}
                          </span>
                        </div>
                        {inv.description && (
                          <p className="text-muted-label text-[11px] mb-1">{inv.description}</p>
                        )}
                        <span className="text-muted-label/80 text-[10px]">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* ─── Lock/Unlock Confirm Modal ────────────────────────────────────── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-background/80 border border-muted-label/40 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-6 text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                confirmModal.action === "lock" ? "bg-danger/10" : "bg-success/10"
              }`}>
                {confirmModal.action === "lock" ? (
                  <Lock size={24} className="text-danger" />
                ) : (
                  <Unlock size={24} className="text-success" />
                )}
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">
                {confirmModal.action === "lock" ? "Lock Account" : "Unlock Account"}
              </h3>
              <p className="text-muted-label text-sm mb-1">
                {confirmModal.action === "lock"
                  ? "Are you sure you want to lock this player's account?"
                  : "Are you sure you want to unlock this player's account?"}
              </p>
              <p className="text-muted-label text-xs">
                {player?.email || player?.display_name || playerId}
              </p>
            </div>

            {confirmModal.action === "lock" && (
              <div className="px-5 pb-2">
                <label htmlFor="lock-reason" className="block text-muted-label text-xs font-medium mb-1.5">
                  Reason (optional)
                </label>
                <input
                  id="lock-reason"
                  type="text"
                  placeholder="e.g. Suspected cheating"
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/60/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-muted-label/40">
              <button
                onClick={() => { setConfirmModal(null); setLockReason(""); }}
                className="px-4 py-2 text-sm text-muted-label hover:text-white hover:bg-background/60 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLockAction}
                disabled={actionLoading}
                className={`inline-flex items-center gap-2 px-4 py-2 font-medium text-sm rounded-lg transition-colors ${
                  confirmModal.action === "lock"
                    ? "bg-danger hover:bg-danger/60 disabled:bg-danger/50 text-white"
                    : "bg-success hover:bg-success/60 disabled:bg-success/50 text-white"
                }`}
              >
                {actionLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                    {confirmModal.action === "lock" ? "Locking..." : "Unlocking..."}
                  </>
                ) : (
                  <>
                    {confirmModal.action === "lock" ? <Lock size={14} /> : <Unlock size={14} />}
                    {confirmModal.action === "lock" ? "Lock Account" : "Unlock Account"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
