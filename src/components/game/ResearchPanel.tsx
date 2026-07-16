"use client";

import { useMemo, useState } from "react";
import {
  useGameStore,
  formatNumber,
  isResearchUnlocked,
} from "@/lib/game/state/store";
import { useShallow } from "zustand/react/shallow";
import { RESEARCH_TREE } from "@/lib/game/config/configCache";
import { RESEARCH_QUEUE_MAX } from "@/lib/game/production/engine/validators/research";
import { useConfigVersion } from "@/components/providers/GameConfigProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils/time";
import {
  FlaskConical,
  Lock,
  Check,
  Timer,
  Zap,
  Cog,
  Truck,
  Bot,
  Brain,
  Atom,
} from "lucide-react";
import { LoadingSpinner } from "@/components/game/shared/LoadingSpinner";
import type { ResearchCategory } from "@/lib/game/shared/types/types";
import { GameItemTooltip } from "@/components/game/GameItemTooltip";
import { GameIcon } from "@/components/icons";

// Module-level constants — lifted out of the component so heavy work
// (effect label/icon lookup) doesn't run on every render and useMemo
// deps stay stable.

// Maps a ResearchEffect.type to a player-facing label + GameIcon key.
// `unlockAutomation` previously fell through to the generic "Bonus"
// branch, hiding automation unlocks behind the same icon as catch-all
// bonuses. Adding it explicitly matches the behaviour of unlockBuilding /
// unlockTransport.
const EFFECT_TYPE_PRESENTATION: Record<
  string,
  { label: string; icon: string }
> = {
  productionSpeed: { label: "Speed", icon: "game-icons:lightning-frequency" },
  transportSpeed: { label: "Transport", icon: "game-icons:truck" },
  powerEfficiency: { label: "Power", icon: "game-icons:battery-75" },
  unlockBuilding: { label: "Unlock", icon: "game-icons:castle" },
  unlockTransport: { label: "Unlock", icon: "game-icons:steam-locomotive" },
  unlockAutomation: { label: "Unlock", icon: "game-icons:robot-helmet" },
  marketBonus: { label: "Market", icon: "game-icons:profit" },
  workerEfficiency: { label: "Workers", icon: "game-icons:overhead" },
  storageBonus: { label: "Storage", icon: "game-icons:cardboard-box" },
};
const EFFECT_FALLBACK = { label: "Bonus", icon: "game-icons:sparkles" };
function effectPresentation(
  type: string,
): { label: string; icon: string } {
  return EFFECT_TYPE_PRESENTATION[type] ?? EFFECT_FALLBACK;
}
const RESEARCH_CATEGORIES: {
  id: ResearchCategory;
  name: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: "automation",
    name: "Automation",
    icon: <Cog className="w-4 h-4" />,
    color: "text-domain",
  },
  {
    id: "logistics",
    name: "Logistics",
    icon: <Truck className="w-4 h-4" />,
    color: "text-brand",
  },
  {
    id: "energy",
    name: "Energy",
    icon: <Zap className="w-4 h-4" />,
    color: "text-warning",
  },
  {
    id: "ai",
    name: "Electronics & AI",
    icon: <Brain className="w-4 h-4" />,
    color: "text-success",
  },
  {
    id: "robotics",
    name: "Robotics",
    icon: <Bot className="w-4 h-4" />,
    color: "text-premium",
  },
  {
    id: "quantum",
    name: "Quantum Tech",
    icon: <Atom className="w-4 h-4" />,
    color: "text-research",
  },
];

export function ResearchPanel() {
  useConfigVersion();
  const store = useGameStore(
    useShallow((s) => ({
      activeResearch: s.activeResearch,
      completedResearch: s.completedResearch,
      researchPoints: s.researchPoints,
      researchProgress: s.researchProgress,
      researchQueue: s.researchQueue,
      startResearch: s.startResearch,
      cancelResearch: s.cancelResearch,
      addToResearchQueue: s.addToResearchQueue,
      removeFromResearchQueue: s.removeFromResearchQueue,
    })),
  );
  const [startingResearch, setStartingResearch] = useState<string | null>(null);
  const [cancelingResearch, setCancelingResearch] = useState<string | null>(null);
  const [queuingNodeId, setQueuingNodeId] = useState<string | null>(null);
  const [unqueuingId, setUnqueuingId] = useState<string | null>(null);

  const activeResearchNode = store.activeResearch
    ? RESEARCH_TREE.find((r) => r.id === store.activeResearch)
    : null;

  const researchByCategory = useMemo(() => {
    const grouped: Record<string, typeof RESEARCH_TREE> = {};
    RESEARCH_CATEGORIES.forEach((cat) => {
      grouped[cat.id] = RESEARCH_TREE.filter((r) => r.category === cat.id).sort(
        (a, b) => a.tier - b.tier,
      );
    });
    return grouped;
  }, []);

  // Hide category cards that have no research nodes (would render an
  // empty box). Keeps the Research Lab readable when RESEARCH_TREE is
  // sparse or a category is temporarily retired in config.
  const populatedCategories = RESEARCH_CATEGORIES.filter(
    (cat) => (researchByCategory[cat.id]?.length ?? 0) > 0,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-research neon-glow-cyan tracking-wide">
            Research Lab
          </h2>
          <p className="text-xs text-muted-label mt-0.5">
            Unlock new technologies and boost production
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-research/50 text-research bg-research/20 text-xs"
          >
            <FlaskConical className="w-3 h-3 mr-1" />
            {formatNumber(store.researchPoints)} RP
          </Badge>
          <Badge
            variant="outline"
            className="border-brand/50 text-brand bg-brand/20 text-xs"
          >
            <Check className="w-3 h-3 mr-1" />
            {store.completedResearch.length}/{RESEARCH_TREE.length}
          </Badge>
        </div>
      </div>

      {/* Active Research */}
      <div className="game-card rounded-xl bg-card p-4 border border-research/30 relative overflow-hidden">
        {/* Subtle glow effect behind active research card */}
        {activeResearchNode && (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.08)_0%,transparent_70%)] pointer-events-none" />
        )}
        <div className="flex items-center gap-2 mb-3 relative z-10">
          <FlaskConical className="w-4 h-4 text-research" />
          <h3 className="text-sm font-semibold text-research">
            Active Research
          </h3>
        </div>
        {activeResearchNode ? (
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-research/20 flex items-center justify-center text-2xl neon-pulse">
                <GameIcon icon={activeResearchNode.icon} size={24} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-subtle">
                  {activeResearchNode.name}
                </div>
                <div className="text-[10px] text-subtle mt-0.5">
                  {activeResearchNode.description}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono text-research">
                  {(
                    (store.researchProgress / activeResearchNode.timeRequired) *
                    100
                  ).toFixed(1)}
                  %
                </div>
                <div className="text-[10px] text-muted-label">
                  <Timer className="w-2.5 h-2.5 inline mr-0.5" />
                  {formatNumber(store.researchProgress)}/
                  {formatDuration(activeResearchNode.timeRequired)}
                </div>
              </div>
            </div>
            <div className="h-3 bg-muted-label rounded-full overflow-hidden">
              <div
                className="h-full research-progress-gradient rounded-full transition-all duration-300 relative"
                style={{
                  width: `${Math.min(100, (store.researchProgress / activeResearchNode.timeRequired) * 100)}%`,
                }}
              >
                <div className="absolute inset-0 bg-linear-to-b from-white/10 to-transparent" />
              </div>
            </div>
            {/*
              Cancel-research control. Server-authoritative cancelResearch
              action refunds 100% of the original RP cost via
              validateCancelResearchAction. The button mirrors the
              project-wide 300ms debounce (same pattern as ContractPanel)
              while the server round-trip is in flight.
            */}
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!store.activeResearch) return;
                  setCancelingResearch(store.activeResearch);
                  store.cancelResearch(store.activeResearch);
                  setTimeout(() => setCancelingResearch(null), 300);
                }}
                disabled={cancelingResearch !== null}
                aria-label={`Cancel active research ${activeResearchNode.name}`}
                className="text-[10px] text-muted-label hover:text-danger h-7 px-2"
              >
                {cancelingResearch === store.activeResearch ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    Cancel · Refund{" "}
                    {formatNumber(activeResearchNode.cost)} RP
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <FlaskConical className="w-10 h-10 text-dim mx-auto mb-2" />
            <p className="text-xs text-muted-label">No active research</p>
            <p className="text-[10px] text-muted-label mt-1">
              Select a research node below to begin
            </p>
          </div>
        )}
      </div>

      {/*
        Research Queue — sits directly under the Active Research card so
        the player can see "what's in flight" + "what comes next" on
        the same screen. Hidden entirely when the queue is empty so the
        page stays uncluttered for players who don't queue.

        Layout per row:
          [position #N]  [icon]  Node Name   Cost   [Remove button]

        Position #1 is the next item to auto-promote when the active
        research completes (PR-1 in the research-progress-tick plan).
        Until that lands, the queue is purely a planned-orders list.
      */}
      {store.researchQueue.length > 0 && (
        <div className="game-card rounded-xl bg-card p-4 border border-research/30 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="w-4 h-4 text-research" />
            <h3 className="text-sm font-semibold text-research">
              Research Queue
            </h3>
            <Badge
              variant="outline"
              className="ml-auto text-[10px] px-1.5 py-0 border-research text-research"
              aria-label={`Queue ${store.researchQueue.length} of ${RESEARCH_QUEUE_MAX} slots used`}
            >
              {store.researchQueue.length}/{RESEARCH_QUEUE_MAX}
            </Badge>
          </div>
          <div className="space-y-2">
            {store.researchQueue.map((queuedId, idx) => {
              const node = RESEARCH_TREE.find((r) => r.id === queuedId);
              if (!node) {
                // Defensive: orphaned id (config drift). Still allow
                // removal so the queue stays clean.
                return (
                  <div
                    key={queuedId}
                    className="rounded-lg p-3 border border-danger/30 bg-danger/10 flex items-center gap-2 text-xs"
                  >
                    <span className="text-danger font-mono">#{idx + 1}</span>
                    <span className="flex-1 text-muted-label">
                      Unknown research: {queuedId}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUnqueuingId(queuedId);
                        store.removeFromResearchQueue(queuedId);
                        setTimeout(() => setUnqueuingId(null), 300);
                      }}
                      disabled={unqueuingId !== null}
                      className="text-[10px] text-muted-label hover:text-danger h-7 px-2"
                      aria-label="Remove unknown entry from queue"
                    >
                      Remove
                    </Button>
                  </div>
                );
              }
              const prereqsMetByEarlierInQueue =
                node.prerequisites.length > 0 &&
                node.prerequisites.every((p) =>
                  store.completedResearch.includes(p),
                );
              return (
                <div
                  key={queuedId}
                  className="rounded-lg p-3 border border-research/30 bg-research/10 flex items-center gap-3"
                >
                  <span className="text-[11px] font-mono text-research w-6 shrink-0">
                    #{idx + 1}
                  </span>
                  <GameIcon icon={node.icon} size={20} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-subtle truncate">
                      {node.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-research/50 text-research"
                      >
                        {formatNumber(node.cost)} RP (held)
                      </Badge>
                      {!prereqsMetByEarlierInQueue &&
                        idx === 0 &&
                        node.prerequisites.length > 0 && (
                          <span className="text-[9px] text-warning">
                            {`Prereq: ${node.prerequisites[0]}`}
                          </span>
                        )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUnqueuingId(queuedId);
                      store.removeFromResearchQueue(queuedId);
                      setTimeout(() => setUnqueuingId(null), 300);
                    }}
                    disabled={unqueuingId !== null}
                    aria-label={`Remove ${node.name} from research queue`}
                    className="text-[10px] text-muted-label hover:text-danger h-7 px-2"
                  >
                    {unqueuingId === queuedId ? (
                      <LoadingSpinner />
                    ) : (
                      "Remove"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-label mt-3 leading-relaxed">
            Queued items hold their RP cost in escrow; removing returns the
            full amount. Items are auto-promoted when the active research
            completes.
          </p>
        </div>
      )}

      {/* Research Tree by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {store.completedResearch.length >= RESEARCH_TREE.length && (
          <div className="col-span-full flex flex-col items-center justify-center py-8 text-muted-label">
            <FlaskConical className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">
              All research completed!{" "}
              <GameIcon
                icon="game-icons:sparkles"
                size={16}
                className="inline"
              />
            </p>
          </div>
        )}
        {populatedCategories.map((cat) => {
          const nodes = researchByCategory[cat.id] || [];
          return (
            <div
              key={cat.id}
              className="game-card rounded-xl bg-card p-4 border border-border"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={cat.color}>{cat.icon}</div>
                <h3 className={`text-sm font-semibold ${cat.color}`}>
                  {cat.name}
                </h3>
                <span className="text-[10px] text-muted-label ml-auto">
                  {
                    nodes.filter((n) => store.completedResearch.includes(n.id))
                      .length
                  }
                  /{nodes.length}
                </span>
              </div>
              <div className="space-y-2">
                {nodes.map((node) => {
                  const isCompleted = store.completedResearch.includes(node.id);
                  const isActive = store.activeResearch === node.id;
                  const isUnlocked = isResearchUnlocked(
                    node.id,
                    store.completedResearch,
                  );
                  const canAfford = store.researchPoints >= node.cost;
                  const queueFull =
                    store.researchQueue.length >= RESEARCH_QUEUE_MAX;
                  const alreadyQueued =
                    store.researchQueue.includes(node.id);
                  const startBlockedByOther =
                    !!store.activeResearch && !isActive;
                  const isStartable =
                    !isCompleted &&
                    !isActive &&
                    isUnlocked &&
                    canAfford &&
                    !startBlockedByOther;
                  const isQueueable =
                    !isCompleted &&
                    !isActive &&
                    isUnlocked &&
                    canAfford &&
                    !alreadyQueued &&
                    !queueFull;
                  // Visual "ready" state covers both start and queue.
                  // The action area picks which button(s) to render.
                  const isAvailable = isStartable || isQueueable;

                  return (
                    <GameItemTooltip
                      key={node.id}
                      name={node.name}
                      icon={node.icon}
                      description={node.description}
                      category={node.category}
                      tier={node.tier}
                      details={[
                        {
                          label: "Cost",
                          value: `${formatNumber(node.cost)} RP`,
                          color: "text-research",
                        },
                        {
                          label: "Time Required",
                          value: formatDuration(node.timeRequired),
                        },
                        ...node.effects.map((effect, i) => ({
                          label: `Effect ${i + 1}`,
                          value: `${effectPresentation(effect.type).label} +${(effect.value * 100).toFixed(0)}%${effect.target ? ` (${effect.target})` : ""}`,
                          color: "text-brand",
                        })),
                      ]}
                      requirements={[
                        ...node.prerequisites.map((pre) => {
                          const preNode = RESEARCH_TREE.find(
                            (r) => r.id === pre,
                          );
                          return {
                            label: "Prerequisite",
                            value: preNode?.name ?? pre,
                            color: store.completedResearch.includes(pre)
                              ? "text-success"
                              : "text-danger",
                          };
                        }),
                      ]}
                      side="right"
                    >
                      <div
                        className={`rounded-lg p-3 ${
                          isCompleted
                            ? "bg-success/10 border border-success/30"
                            : isActive
                              ? "bg-research/10 border border-research/30 neon-pulse shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                              : isAvailable
                                ? "bg-background border border-muted-label hover:border-research/50 hover:-translate-y-0.5 hover:shadow-lg"
                                : "bg-background border border-muted-label opacity-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
                              isCompleted
                                ? "bg-success/30"
                                : isActive
                                  ? "bg-research/30"
                                  : "bg-muted-label/50"
                            }`}
                          >
                            {isCompleted ? (
                              <GameIcon
                                icon="game-icons:check-mark"
                                size={16}
                              />
                            ) : isUnlocked ? (
                              <GameIcon icon={node.icon} size={16} />
                            ) : (
                              <Lock className="w-4 h-4 text-muted-label" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-medium ${isCompleted ? "text-success" : isUnlocked ? "text-subtle" : "text-muted-label"}`}
                              >
                                {node.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[11px] px-1 py-0 border-muted-label text-muted-label"
                              >
                                Tier {node.tier}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-subtle truncate">
                              {node.description}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {isCompleted ? (
                              <Badge className="text-[9px] bg-success/30 text-success border-0">
                                Done
                              </Badge>
                            ) : isActive ? (
                              <Badge className="text-[9px] bg-research/30 text-research border-0 neon-pulse">
                                Active
                              </Badge>
                            ) : (
                              <div>
                                <div className="text-[10px] text-research font-mono">
                                  {formatNumber(node.cost)} RP
                                </div>
                                <div className="text-[9px] text-muted-label">
                                  {formatDuration(node.timeRequired)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Prerequisites */}
                        {!isUnlocked && node.prerequisites.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-muted-label">
                            <div className="text-[9px] text-muted-label mb-1">
                              Requires:
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {node.prerequisites.map((pre) => {
                                const preNode = RESEARCH_TREE.find(
                                  (r) => r.id === pre,
                                );
                                const preDone =
                                  store.completedResearch.includes(pre);
                                return (
                                  <Badge
                                    key={pre}
                                    variant="outline"
                                    className={`text-[11px] px-1 py-0 ${
                                      preDone
                                        ? "border-success text-success"
                                        : "border-danger text-danger"
                                    }`}
                                  >
                                    {preDone ? (
                                      <GameIcon
                                        icon="game-icons:check-mark"
                                        size={12}
                                        className="inline-flex"
                                      />
                                    ) : (
                                      <GameIcon
                                        icon="game-icons:x"
                                        size={12}
                                        className="inline-flex"
                                      />
                                    )}{" "}
                                    {preNode?.name ?? pre}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Effects */}
                        {isUnlocked && !isCompleted && (
                          <div className="mt-2 pt-2 border-t border-muted-label/50">
                            <div className="flex flex-wrap gap-1">
                              {node.effects.map((effect) => {
                                const pres = effectPresentation(effect.type);
                                return (
                                  <Badge
                                    key={effect.id}
                                    variant="outline"
                                    className="text-[11px] px-1 py-0 border-brand text-brand"
                                  >
                                    <GameIcon
                                      icon={pres.icon}
                                      size={14}
                                      className="inline"
                                    />{" "}
                                    {pres.label}{" "}
                                    +{(effect.value * 100).toFixed(0)}%
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Start Research / Queue Actions */}
                        {isAvailable && (
                          <div className="flex gap-2 mt-2">
                            {isStartable && (
                              <Button
                                onClick={() => {
                                  setStartingResearch(node.id);
                                  store.startResearch(node.id);
                                  setTimeout(
                                    () => setStartingResearch(null),
                                    300,
                                  );
                                }}
                                disabled={startingResearch === node.id}
                                className="flex-1 bg-research hover:bg-research text-white text-xs h-7 min-h-9"
                                size="sm"
                                aria-label={`Start research ${node.name}, cost ${formatNumber(
                                  node.cost,
                                )} research points`}
                              >
                                {startingResearch === node.id ? (
                                  <LoadingSpinner />
                                ) : (
                                  <FlaskConical className="w-3 h-3 mr-1" />
                                )}
                                Start ({formatNumber(node.cost)} RP)
                              </Button>
                            )}
                            {isQueueable && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setQueuingNodeId(node.id);
                                  store.addToResearchQueue(node.id);
                                  setTimeout(
                                    () => setQueuingNodeId(null),
                                    300,
                                  );
                                }}
                                disabled={queuingNodeId === node.id}
                                className="flex-1 border-research/50 text-research hover:bg-research/20 text-xs h-7 min-h-9"
                                size="sm"
                                aria-label={`Queue research ${node.name}, holds ${formatNumber(
                                  node.cost,
                                )} research points in escrow`}
                              >
                                {queuingNodeId === node.id ? (
                                  <LoadingSpinner />
                                ) : (
                                  <>
                                    <FlaskConical className="w-3 h-3 mr-1" />
                                    {startBlockedByOther
                                      ? `Queue for next (${formatNumber(node.cost)} RP)`
                                      : `Queue (${formatNumber(node.cost)} RP)`}
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </GameItemTooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
