'use client';

import { useState, useMemo, useCallback } from 'react';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, RESEARCH_TREE, PRODUCTION_CHAINS } from '@/lib/game/data';
import { ResourceType, BuildingType, GameTab } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Zap, AlertTriangle, Lightbulb, TrendingUp, X, ChevronRight, Factory, Activity, Shield, FlaskConical, Package, ArrowUp, DollarSign, Link2, Power } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GameIcon } from '@/components/game/shared/GameIcon';

// --- Types ---
type Priority = 'critical' | 'important' | 'suggested' | 'optional';

type QuickActionType = 'buildNow' | 'sell50' | 'upgradeStorage' | 'goToPower' | 'goToTab';

interface QuickAction {
  type: QuickActionType;
  label: string;
  buildingType?: BuildingType;   // for buildNow
  resource?: ResourceType;       // for sell50 / upgradeStorage
  tab?: GameTab;                 // for goToTab / goToPower
  affordable?: boolean;          // for buildNow
  cost?: number;                 // for buildNow
}

interface Recommendation {
  id: string;
  priority: Priority;
  icon: string;
  title: string;
  description: string;
  actionTab: GameTab;
  actionLabel: string;
  quickAction?: QuickAction;
}

// --- Priority Config ---
const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bgColor: string; hoverBg: string; borderColor: string; glowColor: string; dotColor: string }> = {
  critical: { label: 'CRITICAL', color: 'text-red-400', bgColor: 'bg-red-900/20', hoverBg: 'hover:bg-red-900/30', borderColor: 'border-red-500/40', glowColor: 'rgba(248,113,113,0.15)', dotColor: 'bg-red-400' },
  important: { label: 'IMPORTANT', color: 'text-amber-400', bgColor: 'bg-amber-900/20', hoverBg: 'hover:bg-amber-900/30', borderColor: 'border-amber-500/40', glowColor: 'rgba(251,191,36,0.12)', dotColor: 'bg-amber-400' },
  suggested: { label: 'SUGGESTED', color: 'text-cyan-400', bgColor: 'bg-cyan-900/20', hoverBg: 'hover:bg-cyan-900/30', borderColor: 'border-cyan-500/40', glowColor: 'rgba(34,211,238,0.10)', dotColor: 'bg-cyan-400' },
  optional: { label: 'OPTIONAL', color: 'text-gray-400', bgColor: 'bg-gray-900/20', hoverBg: 'hover:bg-gray-900/30', borderColor: 'border-gray-500/40', glowColor: 'rgba(156,163,175,0.08)', dotColor: 'bg-gray-400' },
};

// --- Helper: find building that produces a resource ---
function findProducerForResource(resource: ResourceType): BuildingType | null {
  for (const [type, def] of Object.entries(BUILDING_DEFS)) {
    if (def.outputs?.some(o => o.resource === resource)) {
      return type as BuildingType;
    }
  }
  return null;
}

// --- Helper: find ALL buildings that produce a resource ---
function findAllProducersForResource(resource: ResourceType): BuildingType[] {
  const results: BuildingType[] = [];
  for (const [type, def] of Object.entries(BUILDING_DEFS)) {
    if (def.outputs?.some(o => o.resource === resource)) {
      results.push(type as BuildingType);
    }
  }
  return results;
}

// --- Helper: find building that consumes a resource ---
function findConsumerForResource(resource: ResourceType): BuildingType | null {
  for (const [type, def] of Object.entries(BUILDING_DEFS)) {
    if (def.inputs?.some(i => i.resource === resource)) {
      return type as BuildingType;
    }
  }
  return null;
}

// --- Helper: find ALL buildings that consume a resource ---
function findAllConsumersForResource(resource: ResourceType): BuildingType[] {
  const results: BuildingType[] = [];
  for (const [type, def] of Object.entries(BUILDING_DEFS)) {
    if (def.inputs?.some(i => i.resource === resource)) {
      results.push(type as BuildingType);
    }
  }
  return results;
}



// --- Health Score Breakdown ---
interface HealthBreakdown {
  power: number;
  production: number;
  storage: number;
  activity: number;
  total: number;
}

// --- Health Score Gauge ---
function HealthGauge({ score, breakdown }: { score: number; breakdown: HealthBreakdown }) {
  const radius = 58;
  const strokeWidth = 8;
  const cx = 75;
  const cy = 75;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color: string;
  let label: string;
  let gradientId: string;
  if (score <= 30) {
    color = '#f87171';
    label = 'Critical';
    gradientId = 'gauge-red';
  } else if (score <= 60) {
    color = '#facc15';
    label = 'Needs Work';
    gradientId = 'gauge-yellow';
  } else if (score <= 80) {
    color = '#22d3ee';
    label = 'Good';
    gradientId = 'gauge-cyan';
  } else {
    color = '#4ade80';
    label = 'Excellent';
    gradientId = 'gauge-green';
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="150" height="150" viewBox="0 0 150 150" className="drop-shadow-lg">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {/* Background track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
        />
        {/* Score arc */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
        {/* Glow effect */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity={0.15}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
        {/* Score text */}
        <text
          x={cx} y={cy - 6}
          textAnchor="middle"
          fill={color}
          fontSize="28"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {Math.round(score)}
        </text>
        <text
          x={cx} y={cy + 16}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
        >
          {label}
        </text>
      </svg>
      {/* Breakdown bars */}
      <div className="w-full space-y-1 px-1">
        <HealthBar label="Power" value={breakdown.power} color="text-yellow-400" barColor="bg-yellow-400" />
        <HealthBar label="Production" value={breakdown.production} color="text-cyan-400" barColor="bg-cyan-400" />
        <HealthBar label="Storage" value={breakdown.storage} color="text-green-400" barColor="bg-green-400" />
        <HealthBar label="Activity" value={breakdown.activity} color="text-purple-400" barColor="bg-purple-400" />
      </div>
    </div>
  );
}

// --- Health Bar ---
function HealthBar({ label, value, color, barColor }: { label: string; value: number; color: string; barColor: string }) {
  const pct = Math.round(value);
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[8px] ${color} w-[52px] text-right font-medium`}>{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[8px] ${color} font-mono w-6`}>{pct}</span>
    </div>
  );
}

// --- Recommendation Card ---
function RecommendationCard({
  rec,
  onDismiss,
  onAction,
  onQuickAction,
  index,
}: {
  rec: Recommendation;
  onDismiss: (id: string) => void;
  onAction: (tab: GameTab) => void;
  onQuickAction: (action: QuickAction) => void;
  index: number;
}) {
  const config = PRIORITY_CONFIG[rec.priority];

  return (
    <motion.div
      layout
    >
      <Card className={`${config.bgColor} ${config.borderColor} border backdrop-blur-sm`} style={{ boxShadow: `0 0 20px ${config.glowColor}` }}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <GameIcon icon={rec.icon} size={24} />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={`${config.color} ${config.borderColor} text-[9px] px-1.5 py-0 font-bold`}>
                  {config.label}
                </Badge>
                <h4 className="text-sm font-semibold text-gray-200 truncate">{rec.title}</h4>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{rec.description}</p>

              {/* Quick Action Button */}
              {rec.quickAction && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className={`${config.color} ${config.borderColor} text-[10px] h-7 px-2.5 ${config.hoverBg} gap-1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAction(rec.quickAction!);
                    }}
                    disabled={rec.quickAction.type === 'buildNow' && !rec.quickAction.affordable}
                  >
                    {rec.quickAction.type === 'buildNow' && (
                      <>
                        <Factory className="w-3 h-3" />
                        {rec.quickAction.affordable ? `Build ${BUILDING_DEFS[rec.quickAction.buildingType!]?.name ?? ''} ($${formatNumber(rec.quickAction.cost ?? 0)})` : `Can't Afford ${BUILDING_DEFS[rec.quickAction.buildingType!]?.name ?? ''}`}
                      </>
                    )}
                    {rec.quickAction.type === 'sell50' && (
                      <>
                        <DollarSign className="w-3 h-3" />
                        Sell 50%
                      </>
                    )}
                    {rec.quickAction.type === 'upgradeStorage' && (
                      <>
                        <ArrowUp className="w-3 h-3" />
                        Upgrade Storage
                      </>
                    )}
                    {rec.quickAction.type === 'goToPower' && (
                      <>
                        <Power className="w-3 h-3" />
                        Go to Power
                      </>
                    )}
                    {rec.quickAction.type === 'goToTab' && (
                      <>
                        <ChevronRight className="w-3 h-3" />
                        {rec.quickAction.label}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Navigate + Dismiss */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className={`${config.color} ${config.borderColor} text-[10px] h-7 px-2 ${config.hoverBg}`}
                onClick={() => onAction(rec.actionTab)}
              >
                {rec.actionLabel}
                <ChevronRight className="w-3 h-3 ml-0.5" />
              </Button>
              <button
                onClick={() => onDismiss(rec.id)}
                className="p-1 text-gray-600 hover:text-gray-300 transition-colors rounded"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// --- Quick Stat Card ---
function QuickStatCard({ icon: Icon, label, value, color, subtext }: { icon: React.ElementType; label: string; value: string; color: string; subtext?: string }) {
  return (
    <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
      {subtext && <span className="text-[9px] text-gray-600">{subtext}</span>}
    </div>
  );
}

// --- Production Chain Status ---
type ChainStatus = 'fullyProducing' | 'partial' | 'notStarted' | 'locked';

function ChainStatusDot({ status }: { status: ChainStatus }) {
  const colorMap: Record<ChainStatus, string> = {
    fullyProducing: 'bg-green-400',
    partial: 'bg-yellow-400',
    notStarted: 'bg-red-400',
    locked: 'bg-gray-600',
  };
  const titleMap: Record<ChainStatus, string> = {
    fullyProducing: 'Fully Producing',
    partial: 'Partially Producing',
    notStarted: 'Not Started',
    locked: 'Locked',
  };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colorMap[status]} shrink-0`}
      title={titleMap[status]}
    />
  );
}

// --- Main Component ---
export default function AIAdvisorPanel() {
  const store = useGameStore();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  }, []);

  const handleAction = useCallback((tab: GameTab) => {
    store.setActiveTab(tab);
  }, [store]);

  const handleQuickAction = useCallback((action: QuickAction) => {
    if (action.type === 'buildNow' && action.buildingType && action.affordable) {
      useGameStore.getState().buildBuilding(action.buildingType);
    } else if (action.type === 'sell50' && action.resource) {
      const state = useGameStore.getState();
      const stock = state.resources[action.resource] ?? 0;
      const sellAmount = Math.floor(stock * 0.5);
      if (sellAmount > 0) {
        state.sellResource(action.resource, sellAmount);
      }
    } else if (action.type === 'upgradeStorage' && action.resource) {
      useGameStore.getState().upgradeStorage(action.resource, 1);
    } else if (action.type === 'goToPower') {
      useGameStore.getState().setActiveTab('power');
    } else if (action.type === 'goToTab' && action.tab) {
      useGameStore.getState().setActiveTab(action.tab);
    }
  }, []);

  // --- Calculate Health Score with Breakdown ---
  const healthBreakdown = useMemo((): HealthBreakdown => {
    // Power Score (0-25)
    const powerScore = Math.round(Math.min(25, store.powerGrid.efficiency * 25));

    // Production Score (0-25) — resource balance
    const allResources = Object.keys(store.computedProductionRates) as ResourceType[];
    let balancedCount = 0;
    let totalChecked = 0;
    for (const res of allResources) {
      const consumption = store.computedConsumptionRates[res] ?? 0;
      const production = store.computedProductionRates[res] ?? 0;
      if (consumption > 0 || production > 0) {
        totalChecked++;
        if (production >= consumption * 0.8) {
          balancedCount++;
        }
      }
    }
    const productionScore = totalChecked > 0 ? Math.round((balancedCount / totalChecked) * 25) : 25;

    // Storage Score (0-25) — storage utilization (not too full, not too empty)
    let storageScoreSum = 0;
    let storageCount = 0;
    for (const res of allResources) {
      const stock = store.resources[res] ?? 0;
      const capacity = store.resourceCapacity[res] ?? 1;
      if (capacity > 0 && (stock > 0 || store.computedProductionRates[res] > 0)) {
        storageCount++;
        const fillRatio = stock / capacity;
        // Ideal range: 20-80%, penalize >90% (overfull) and <5% (starved)
        if (fillRatio > 0.9) {
          storageScoreSum += Math.max(0, 1 - (fillRatio - 0.9) * 5); // 0.9=1.0, 1.0=0.5
        } else if (fillRatio < 0.05) {
          storageScoreSum += 0.3;
        } else {
          storageScoreSum += 1;
        }
      }
    }
    const storageScore = storageCount > 0 ? Math.round((storageScoreSum / storageCount) * 25) : 25;

    // Activity Score (0-25) — building activity rate
    const totalBuildings = store.buildings.length;
    const activeBuildings = store.buildings.filter(b => b.active).length;
    const activityScore = totalBuildings > 0 ? Math.round((activeBuildings / totalBuildings) * 25) : 0;

    const total = Math.max(0, Math.min(100, powerScore + productionScore + storageScore + activityScore));
    return {
      power: powerScore,
      production: productionScore,
      storage: storageScore,
      activity: activityScore,
      total,
    };
  }, [store.powerGrid, store.buildings, store.computedProductionRates, store.computedConsumptionRates, store.resources, store.resourceCapacity]);

  const healthScore = healthBreakdown.total;

  // --- Generate Recommendations ---
  const recommendations = useMemo(() => {
    const recs: Recommendation[] = [];
    let recId = 0;
    const builtTypes = new Set(store.buildings.map(b => b.type));
    const currentMoney = store.money;

    // ===== 1. POWER WARNINGS (Priority: Critical) =====

    // No power plants at all but have buildings
    const powerPlants = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');
    if (powerPlants.length === 0 && store.buildings.length > 0) {
      const coalCost = getBuildingCost('coalGenerator', store.buildings.filter(b => b.type === 'coalGenerator').length);
      const affordable = currentMoney >= coalCost;
      recs.push({
        id: `no-power-${recId++}`,
        priority: 'critical',
        icon: 'gi:lightning-storm',
        title: 'No Power Plants!',
        description: 'You have buildings but no power plants! Buildings without power run at only 10% efficiency. Build a Coal Generator now.',
        actionTab: 'power',
        actionLabel: 'Power',
        quickAction: {
          type: 'buildNow',
          label: 'Build Coal Generator',
          buildingType: 'coalGenerator',
          affordable,
          cost: coalCost,
        },
      });
    }

    // Power grid critical
    if (store.powerGrid.efficiency < 0.5 && store.buildings.length > 0 && powerPlants.length > 0) {
      const pct = Math.round(store.powerGrid.efficiency * 100);
      // Find cheapest available power plant
      const powerTypes: BuildingType[] = ['coalGenerator', 'solarPanel', 'windTurbine', 'nuclearReactor', 'fusionReactor'];
      let cheapestType: BuildingType | null = null;
      let cheapestCost = Infinity;
      for (const pt of powerTypes) {
        if (isBuildingUnlocked(pt, store.completedResearch, store.prestigeState, store.buildings.length)) {
          const cost = getBuildingCost(pt, store.buildings.filter(b => b.type === pt).length);
          if (cost < cheapestCost) {
            cheapestCost = cost;
            cheapestType = pt;
          }
        }
      }
      recs.push({
        id: `power-critical-${recId++}`,
        priority: 'critical',
        icon: 'gi:lightning-storm',
        title: 'Power Grid Critical!',
        description: `Factories running at ${pct}% efficiency! Build another ${cheapestType ? BUILDING_DEFS[cheapestType]?.name : 'power plant'} immediately to restore power.`,
        actionTab: 'power',
        actionLabel: 'Power',
        quickAction: cheapestType ? {
          type: 'buildNow',
          label: `Build ${BUILDING_DEFS[cheapestType]?.name}`,
          buildingType: cheapestType,
          affordable: currentMoney >= cheapestCost,
          cost: cheapestCost,
        } : {
          type: 'goToPower',
          label: 'Go to Power',
        },
      });
    } else if (store.powerGrid.efficiency < 0.8 && store.buildings.length > 0 && powerPlants.length > 0) {
      // Power warning — consumption > 70% of production
      const pct = Math.round(store.powerGrid.efficiency * 100);
      const powerTypes: BuildingType[] = ['coalGenerator', 'solarPanel', 'windTurbine', 'nuclearReactor', 'fusionReactor'];
      let cheapestType: BuildingType | null = null;
      let cheapestCost = Infinity;
      for (const pt of powerTypes) {
        if (isBuildingUnlocked(pt, store.completedResearch, store.prestigeState, store.buildings.length)) {
          const cost = getBuildingCost(pt, store.buildings.filter(b => b.type === pt).length);
          if (cost < cheapestCost) {
            cheapestCost = cost;
            cheapestType = pt;
          }
        }
      }
      recs.push({
        id: `power-warning-${recId++}`,
        priority: 'important',
        icon: 'gi:lightning-frequency',
        title: `Power Grid at ${pct}%`,
        description: `Power consumption is ${pct}% of production — build another ${cheapestType ? BUILDING_DEFS[cheapestType]?.name : 'power plant'} before expanding further.`,
        actionTab: 'power',
        actionLabel: 'Power',
        quickAction: cheapestType ? {
          type: 'buildNow',
          label: `Build ${BUILDING_DEFS[cheapestType]?.name}`,
          buildingType: cheapestType,
          affordable: currentMoney >= cheapestCost,
          cost: cheapestCost,
        } : {
          type: 'goToPower',
          label: 'Go to Power',
        },
      });
    }

    // ===== 2. BOTTLENECK FIX (Priority: Critical/Important) =====
    // Detects when a raw resource is stockpiling but its Tier 1 product isn't being produced
    for (const res of Object.keys(store.computedProductionRates) as ResourceType[]) {
      const production = store.computedProductionRates[res] ?? 0;
      const consumption = store.computedConsumptionRates[res] ?? 0;
      const stock = store.resources[res] ?? 0;
      const capacity = store.resourceCapacity[res] ?? 1;

      // Resource is being produced but not consumed, and it has a processor we haven't built
      if (production > consumption && production > 0.01 && (stock / capacity) > 0.3) {
        const meta = RESOURCE_META[res];
        if (!meta || meta.tier > 0) continue; // Only raw/tier-0 resources stockpiling

        // Find a consumer (factory) that processes this into something
        const consumers = findAllConsumersForResource(res);
        const unbuiltConsumer = consumers.find(c => !builtTypes.has(c) && isBuildingUnlocked(c, store.completedResearch, store.prestigeState, store.buildings.length));

        if (unbuiltConsumer) {
          const consumerDef = BUILDING_DEFS[unbuiltConsumer];
          const outputName = consumerDef?.outputs?.[0] ? RESOURCE_META[consumerDef.outputs[0].resource as ResourceType]?.name : 'products';
          const cost = getBuildingCost(unbuiltConsumer, store.buildings.filter(b => b.type === unbuiltConsumer).length);
          const affordable = currentMoney >= cost;

          recs.push({
            id: `bottleneck-${res}-${recId++}`,
            priority: 'important',
            icon: 'gi:wrench',
            title: `Build a ${consumerDef?.name ?? 'Processor'}`,
            description: `You're producing ${meta.name} but have no ${outputName}. Build a ${consumerDef?.name} to process your ${meta.name} into ${outputName}.`,
            actionTab: consumerDef?.category === 'extractor' ? 'resources' : 'factories',
            actionLabel: consumerDef?.name ?? 'Build',
            quickAction: {
              type: 'buildNow',
              label: `Build ${consumerDef?.name}`,
              buildingType: unbuiltConsumer,
              affordable,
              cost,
            },
          });
        }
      }
    }

    // ===== 3. PRODUCTION GAP (Priority: Important) =====
    // Detects when a factory's input resources aren't being produced
    for (const building of store.buildings) {
      if (!building.active) continue;
      const def = BUILDING_DEFS[building.type];
      if (!def?.inputs) continue;

      for (const input of def.inputs) {
        if (input.resource === 'money') continue;
        const inputRes = input.resource as ResourceType;
        const inputProduction = store.computedProductionRates[inputRes] ?? 0;
        const inputConsumption = store.computedConsumptionRates[inputRes] ?? 0;

        // Input is being consumed more than produced (or not produced at all)
        if (inputConsumption > inputProduction && inputProduction < inputConsumption * 0.5) {
          const inputMeta = RESOURCE_META[inputRes];
          const producerType = findProducerForResource(inputRes);
          const producerName = producerType ? BUILDING_DEFS[producerType]?.name : null;

          // Only suggest if the producer isn't built yet or not enough
          const producerBuilt = producerType ? builtTypes.has(producerType) : false;

          if (!producerBuilt && producerType) {
            const cost = getBuildingCost(producerType, store.buildings.filter(b => b.type === producerType).length);
            const affordable = currentMoney >= cost;

            recs.push({
              id: `prod-gap-${building.type}-${inputRes}-${recId++}`,
              priority: 'important',
              icon: 'gi:hazard-sign',
              title: `Your ${def.name} is Waiting for ${inputMeta?.name ?? inputRes}`,
              description: `Build a ${producerName} to supply ${inputMeta?.name ?? inputRes} — your ${def.name} can't run without it.`,
              actionTab: BUILDING_DEFS[producerType]?.category === 'extractor' ? 'resources' : 'factories',
              actionLabel: producerName ?? 'Build',
              quickAction: {
                type: 'buildNow',
                label: `Build ${producerName}`,
                buildingType: producerType,
                affordable,
                cost,
              },
            });
            break; // Only report first missing input per building
          }
        }
      }
    }

    // ===== 4. STORAGE FULL (Priority: Important) =====
    // When any resource is > 90% capacity
    for (const res of Object.keys(store.resources) as ResourceType[]) {
      const stock = store.resources[res] ?? 0;
      const capacity = store.resourceCapacity[res] ?? 1;
      if (capacity <= 0) continue;
      const fillRatio = stock / capacity;

      if (fillRatio > 0.9 && stock > 5) {
        const meta = RESOURCE_META[res];
        recs.push({
          id: `storage-full-${res}-${recId++}`,
          priority: 'important',
          icon: 'gi:cardboard-box',
          title: `${meta?.name ?? res} at ${Math.round(fillRatio * 100)}% Capacity`,
          description: `${meta?.name ?? res} storage is almost full (${formatNumber(stock)}/${formatNumber(capacity)}). Sell some or upgrade storage to avoid wasted production.`,
          actionTab: 'market',
          actionLabel: 'Market',
          quickAction: {
            type: 'sell50',
            label: 'Sell 50%',
            resource: res,
          },
        });
        // Also add upgrade storage as an alternative suggestion
        // Max 3 storage full recommendations
        if (recs.filter(r => r.id.startsWith('storage-full')).length >= 3) break;
      }
    }

    // ===== 5. IDLE BUILDING (Priority: Important) =====
    // Detects built but inactive buildings
    for (const building of store.buildings) {
      if (building.active) continue;
      const def = BUILDING_DEFS[building.type];
      if (!def) continue;

      // Determine why it might be idle
      let reason = 'check power or input supply';
      if (store.powerGrid.efficiency < 0.5) {
        reason = 'power grid is overloaded — build more power plants';
      } else if (def.inputs) {
        const missingInputs = def.inputs
          .filter(i => i.resource !== 'money' && (store.resources[i.resource as ResourceType] ?? 0) < i.amount)
          .map(i => RESOURCE_META[i.resource as ResourceType]?.name ?? i.resource);
        if (missingInputs.length > 0) {
          reason = `missing ${missingInputs.join(', ')}`;
        }
      }

      recs.push({
        id: `idle-${building.id}-${recId++}`,
        priority: 'important',
        icon: 'gi:sleepy',
        title: `Your ${def.name} is Idle`,
        description: `${def.name} is built but inactive — ${reason}.`,
        actionTab: def.category === 'power' ? 'power' : def.category === 'extractor' ? 'resources' : 'factories',
        actionLabel: 'View',
      });

      // Max 3 idle building recommendations
      if (recs.filter(r => r.id.startsWith('idle-')).length >= 3) break;
    }

    // ===== 6. CHAIN COMPLETION (Priority: Suggested) =====
    // When prerequisites exist but next step doesn't
    for (const chain of PRODUCTION_CHAINS) {
      if (chain.steps.length < 2) continue;

      // Find the first step that has a producer built
      let hasAnyStepBuilt = false;
      let missingStepIndex = -1;

      for (let i = 0; i < chain.steps.length; i++) {
        const stepResource = chain.steps[i] as ResourceType;
        const producer = findProducerForResource(stepResource);

        if (producer && builtTypes.has(producer)) {
          hasAnyStepBuilt = true;
          // Check if the NEXT step has a producer
          if (i + 1 < chain.steps.length) {
            const nextResource = chain.steps[i + 1] as ResourceType;
            const nextProducer = findProducerForResource(nextResource);
            if (nextProducer && !builtTypes.has(nextProducer)) {
              // Check if it's unlocked
              if (isBuildingUnlocked(nextProducer, store.completedResearch, store.prestigeState, store.buildings.length)) {
                missingStepIndex = i + 1;
                break;
              }
            }
          }
        }
      }

      if (hasAnyStepBuilt && missingStepIndex >= 0) {
        const missingResource = chain.steps[missingStepIndex] as ResourceType;
        const missingMeta = RESOURCE_META[missingResource];
        const nextProducer = findProducerForResource(missingResource);
        if (nextProducer) {
          const nextProducerName = BUILDING_DEFS[nextProducer]?.name;
          const cost = getBuildingCost(nextProducer, store.buildings.filter(b => b.type === nextProducer).length);
          const affordable = currentMoney >= cost;

          recs.push({
            id: `chain-complete-${chain.name}-${recId++}`,
            priority: 'suggested',
            icon: 'gi:linked-rings',
            title: `Complete the ${chain.name} Chain`,
            description: `Build a ${nextProducerName} to produce ${missingMeta?.name ?? missingResource}. You already have the prerequisites!`,
            actionTab: BUILDING_DEFS[nextProducer]?.category === 'extractor' ? 'resources' : 'factories',
            actionLabel: nextProducerName ?? 'Build',
            quickAction: {
              type: 'buildNow',
              label: `Build ${nextProducerName}`,
              buildingType: nextProducer,
              affordable,
              cost,
            },
          });
        }
      }
    }

    // ===== 7. EXISTING: Resource Deficits (Priority: Important) =====
    const deficitResources: ResourceType[] = [];
    for (const res of Object.keys(store.computedConsumptionRates) as ResourceType[]) {
      const consumption = store.computedConsumptionRates[res] ?? 0;
      const production = store.computedProductionRates[res] ?? 0;

      if (consumption > production && consumption > 0.01) {
        deficitResources.push(res);
        // Skip if we already have a production gap recommendation for this
        if (recs.some(r => r.id.includes(`prod-gap-`) && r.id.includes(res))) continue;

        const meta = RESOURCE_META[res];
        const producerType = findProducerForResource(res);
        const producerName = producerType ? BUILDING_DEFS[producerType]?.name : null;
        const cost = producerType ? getBuildingCost(producerType, store.buildings.filter(b => b.type === producerType).length) : 0;
        const affordable = producerType ? currentMoney >= cost : false;

        recs.push({
          id: `deficit-${res}-${recId++}`,
          priority: 'important',
          icon: 'gi:hazard-sign',
          title: `${meta?.name ?? res} Deficit`,
          description: `Consuming ${consumption.toFixed(1)}/t but only producing ${production.toFixed(1)}/t.${producerName ? ` Build more ${producerName}s.` : ''}`,
          actionTab: producerType && BUILDING_DEFS[producerType]?.category === 'extractor' ? 'resources' : 'factories',
          actionLabel: producerName ?? 'Factories',
          quickAction: producerType ? {
            type: 'buildNow',
            label: `Build ${producerName}`,
            buildingType: producerType,
            affordable,
            cost,
          } : undefined,
        });
      }
    }

    // ===== 8. EXISTING: Idle Resources / Stockpiled (Priority: Suggested) =====
    for (const res of Object.keys(store.computedProductionRates) as ResourceType[]) {
      const stock = store.resources[res] ?? 0;
      const capacity = store.resourceCapacity[res] ?? 1;
      const fillRatio = stock / capacity;

      // Between 80-90% — not critical enough for storage-full, but worth noting
      if (fillRatio > 0.8 && fillRatio <= 0.9 && stock > 5) {
        // Skip if we already have a bottleneck or storage-full for this
        if (recs.some(r => r.id.includes(`bottleneck-${res}`) || r.id.includes(`storage-full-${res}`))) continue;

        const consumerType = findConsumerForResource(res);
        const hasConsumer = consumerType ? store.buildings.some(b => b.type === consumerType) : false;

        if (!hasConsumer && !deficitResources.includes(res)) {
          const meta = RESOURCE_META[res];
          const consumerName = consumerType ? BUILDING_DEFS[consumerType]?.name : null;

          recs.push({
            id: `idle-${res}-${recId++}`,
            priority: 'suggested',
            icon: 'gi:light-bulb',
            title: `${meta?.name ?? res} Stockpiled`,
            description: `You have ${formatNumber(stock)} ${meta?.name ?? res} stockpiled (${(fillRatio * 100).toFixed(0)}% full).${consumerName ? ` Build a ${consumerName} to process it.` : ' Consider selling on the market.'}`,
            actionTab: consumerType ? 'factories' : 'market',
            actionLabel: consumerName ?? 'Market',
            quickAction: !consumerType ? {
              type: 'sell50',
              label: 'Sell 50%',
              resource: res,
            } : consumerType && isBuildingUnlocked(consumerType, store.completedResearch, store.prestigeState, store.buildings.length) ? {
              type: 'buildNow',
              label: `Build ${consumerName}`,
              buildingType: consumerType,
              affordable: currentMoney >= getBuildingCost(consumerType, store.buildings.filter(b => b.type === consumerType).length),
              cost: getBuildingCost(consumerType, store.buildings.filter(b => b.type === consumerType).length),
            } : undefined,
          });
        }
      }
    }

    // ===== 9. EXISTING: Research Suggestions (Priority: Suggested) =====
    if (!store.activeResearch) {
      const availableResearch = RESEARCH_TREE.filter(node => {
        if (store.completedResearch.includes(node.id)) return false;
        if (!node.prerequisites.every(pre => store.completedResearch.includes(pre))) return false;
        if (store.researchPoints < node.cost) return false;
        return true;
      });

      if (availableResearch.length > 0) {
        const bestResearch = availableResearch.sort((a, b) => a.tier - b.tier || a.cost - b.cost)[0];
        recs.push({
          id: `research-${recId++}`,
          priority: 'suggested',
          icon: 'gi:chemical-drop',
          title: 'Research Available',
          description: `You have ${availableResearch.length} unlocked research available. Start researching ${bestResearch.name} for its benefits.`,
          actionTab: 'research',
          actionLabel: 'Research',
          quickAction: {
            type: 'goToTab',
            label: 'Go to Research',
            tab: 'research',
          },
        });
      }
    }

    // Also suggest if they have research points and no active research
    if (!store.activeResearch && store.researchPoints >= 50 && store.completedResearch.length === 0) {
      recs.push({
        id: `research-start-${recId++}`,
        priority: 'suggested',
        icon: 'gi:chemical-drop',
        title: 'Start Researching',
        description: `You have ${formatNumber(store.researchPoints)} RP but no active research. Research unlocks powerful bonuses and new buildings.`,
        actionTab: 'research',
        actionLabel: 'Research',
        quickAction: {
          type: 'goToTab',
          label: 'Go to Research',
          tab: 'research',
        },
      });
    }

    // ===== 10. EXISTING: Market Opportunities (Priority: Optional) =====
    let marketOpps = 0;
    for (const m of store.market) {
      if (m.currentPrice > m.basePrice * 1.3) {
        const meta = RESOURCE_META[m.resource];
        const pricePercent = Math.round(((m.currentPrice - m.basePrice) / m.basePrice) * 100);
        const held = store.resources[m.resource] ?? 0;

        if (held > 0) {
          recs.push({
            id: `market-sell-${m.resource}-${recId++}`,
            priority: 'optional',
            icon: 'gi:profit',
            title: `${meta?.name ?? m.resource} Price Surge`,
            description: `${meta?.name ?? m.resource} prices are ${pricePercent}% above base! You have ${formatNumber(held)} units. Consider selling now.`,
            actionTab: 'market',
            actionLabel: 'Sell',
            quickAction: {
              type: 'sell50',
              label: 'Sell 50%',
              resource: m.resource,
            },
          });
        } else {
          recs.push({
            id: `market-opportunity-${m.resource}-${recId++}`,
            priority: 'optional',
            icon: 'gi:profit',
            title: `${meta?.name ?? m.resource} Price High`,
            description: `${meta?.name ?? m.resource} prices are ${pricePercent}% above base. If you can produce it, now is a good time to sell.`,
            actionTab: 'market',
            actionLabel: 'Market',
          });
        }
        marketOpps++;
        if (marketOpps >= 3) break;
      }
    }

    // Sort by priority
    const priorityOrder: Record<Priority, number> = { critical: 0, important: 1, suggested: 2, optional: 3 };
    recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recs;
  }, [store.powerGrid, store.buildings, store.computedConsumptionRates, store.computedProductionRates, store.resources, store.resourceCapacity, store.activeResearch, store.completedResearch, store.researchPoints, store.market, store.money, store.prestigeState]);

  // Filter dismissed
  const visibleRecommendations = useMemo(() => {
    return recommendations.filter(r => !dismissedIds.has(r.id));
  }, [recommendations, dismissedIds]);

  // --- Quick Stats ---
  const activeBuildings = useMemo(() => store.buildings.filter(b => b.active).length, [store.buildings]);
  const deficitCount = useMemo(() => {
    let count = 0;
    const allResources = Object.keys(store.computedConsumptionRates) as ResourceType[];
    for (const res of allResources) {
      const consumption = store.computedConsumptionRates[res] ?? 0;
      const production = store.computedProductionRates[res] ?? 0;
      if (consumption > production && consumption > 0.01) count++;
    }
    return count;
  }, [store.computedConsumptionRates, store.computedProductionRates]);

  const powerEfficiency = store.powerGrid.efficiency;
  const researchProgress = `${store.completedResearch.length}/${RESEARCH_TREE.length}`;

  // --- Production Chain Status ---
  const chainStatuses = useMemo(() => {
    const results: { name: string; color: string; status: ChainStatus; steps: { resource: ResourceType; hasPositiveNet: boolean; hasProducer: boolean }[] }[] = [];
    const builtTypes = new Set(store.buildings.map(b => b.type));

    for (const chain of PRODUCTION_CHAINS) {
      if (chain.steps.length < 2) continue;

      const steps = chain.steps.map(stepRes => {
        const res = stepRes as ResourceType;
        const production = store.computedProductionRates[res] ?? 0;
        const consumption = store.computedConsumptionRates[res] ?? 0;
        const producer = findProducerForResource(res);
        const hasProducer = producer ? builtTypes.has(producer) : false;
        const hasPositiveNet = (production - consumption) > 0 || (production > 0 && consumption === 0);
        return { resource: res, hasPositiveNet, hasProducer };
      });

      // Determine chain status
      const anyProducerBuilt = steps.some(s => s.hasProducer);
      const allProducersBuilt = steps.every(s => s.hasProducer);
      const allPositiveNet = steps.every(s => s.hasPositiveNet);

      // Check if chain is locked (no producer can be built yet)
      let allLocked = true;
      for (const step of chain.steps) {
        const producer = findProducerForResource(step as ResourceType);
        if (producer && isBuildingUnlocked(producer, store.completedResearch, store.prestigeState, store.buildings.length)) {
          allLocked = false;
          break;
        }
      }

      let status: ChainStatus;
      if (allLocked) {
        status = 'locked';
      } else if (!anyProducerBuilt) {
        status = 'notStarted';
      } else if (allPositiveNet && allProducersBuilt) {
        status = 'fullyProducing';
      } else {
        status = 'partial';
      }

      results.push({ name: chain.name, color: chain.color, status, steps });
    }

    return results;
  }, [store.buildings, store.computedProductionRates, store.computedConsumptionRates, store.completedResearch, store.prestigeState]);

  // Deduplicate chain statuses by name (keep highest status)
  const uniqueChainStatuses = useMemo(() => {
    const map = new Map<string, { name: string; color: string; status: ChainStatus }>();
    const statusPriority: Record<ChainStatus, number> = { locked: 0, notStarted: 1, partial: 2, fullyProducing: 3 };
    for (const c of chainStatuses) {
      const existing = map.get(c.name);
      if (!existing || statusPriority[c.status] > statusPriority[existing.status]) {
        map.set(c.name, { name: c.name, color: c.color, status: c.status });
      }
    }
    return Array.from(map.values());
  }, [chainStatuses]);

  // Chain status counts
  const chainCounts = useMemo(() => {
    let fullyProducing = 0;
    let partial = 0;
    let notStarted = 0;
    let locked = 0;
    for (const c of uniqueChainStatuses) {
      if (c.status === 'fullyProducing') fullyProducing++;
      else if (c.status === 'partial') partial++;
      else if (c.status === 'notStarted') notStarted++;
      else locked++;
    }
    return { fullyProducing, partial, notStarted, locked, total: uniqueChainStatuses.length };
  }, [uniqueChainStatuses]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2 neon-glow-cyan">
            <Brain className="w-5 h-5" />
            AI Advisor
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Smart recommendations for your factory</p>
        </div>
        {visibleRecommendations.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${visibleRecommendations.some(r => r.priority === 'critical') ? 'border-red-500/50 text-red-400' : visibleRecommendations.some(r => r.priority === 'important') ? 'border-amber-500/50 text-amber-400' : 'border-cyan-500/50 text-cyan-400'}`}>
              {visibleRecommendations.length} recommendation{visibleRecommendations.length !== 1 ? 's' : ''}
            </Badge>
            {dismissedIds.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-[10px] h-6 px-2 text-gray-500 hover:text-gray-300"
                onClick={() => setDismissedIds(new Set())}
              >
                Show all
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Health Score + Quick Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
        {/* Health Score */}
        <Card className="bg-[#0a0e17] border border-cyan-900/20">
          <CardContent className="p-4 flex items-center justify-center">
            <HealthGauge score={healthScore} breakdown={healthBreakdown} />
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <QuickStatCard
            icon={Factory}
            label="Active Buildings"
            value={activeBuildings.toString()}
            color="text-emerald-400"
            subtext={`of ${store.buildings.length} total`}
          />
          <QuickStatCard
            icon={Zap}
            label="Power Efficiency"
            value={`${(powerEfficiency * 100).toFixed(0)}%`}
            color={powerEfficiency >= 0.8 ? 'text-green-400' : powerEfficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'}
            subtext={`${formatNumber(store.powerGrid.totalProduction)}MW / ${formatNumber(store.powerGrid.totalConsumption)}MW`}
          />
          <QuickStatCard
            icon={AlertTriangle}
            label="Deficits"
            value={deficitCount.toString()}
            color={deficitCount > 0 ? 'text-orange-400' : 'text-green-400'}
            subtext={deficitCount > 0 ? 'resources running low' : 'all resources balanced'}
          />
          <QuickStatCard
            icon={FlaskConical}
            label="Research"
            value={researchProgress}
            color="text-purple-400"
            subtext={store.activeResearch ? '1 in progress' : 'none active'}
          />
        </div>
      </div>

      {/* Production Chain Status */}
      {uniqueChainStatuses.length > 0 && (
        <Card className="bg-[#0a0e17] border border-cyan-900/20">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-cyan-400" />
              Production Chain Status
              <span className="ml-auto text-[9px] text-gray-500">
                {chainCounts.fullyProducing} <span className="text-green-400">active</span> · {chainCounts.partial} <span className="text-yellow-400">partial</span> · {chainCounts.notStarted} <span className="text-red-400">idle</span> · {chainCounts.locked} <span className="text-gray-500">locked</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="max-h-48 overflow-y-auto game-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {uniqueChainStatuses.map(chain => (
                  <div key={chain.name} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-cyan-900/10 transition-colors">
                    <ChainStatusDot status={chain.status} />
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: chain.color }}
                    />
                    <span className={`text-[11px] truncate ${chain.status === 'locked' ? 'text-gray-600' : chain.status === 'notStarted' ? 'text-gray-400' : 'text-gray-300'}`}>
                      {chain.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-emerald-400" />
          Recommendations
        </h3>

        {visibleRecommendations.length === 0 ? (
          <Card className="bg-[#0a0e17] border border-cyan-900/20">
            <CardContent className="p-6 text-center">
              <div className="text-3xl mb-2"><GameIcon icon="gi:check-mark" size={28} /></div>
              <p className="text-sm text-gray-400 font-medium">All systems operational!</p>
              <p className="text-xs text-gray-600 mt-1">No urgent recommendations at this time. Keep expanding your factory!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto game-scrollbar pr-1">
            <AnimatePresence mode="popLayout">
              {visibleRecommendations.map((rec, index) => (
                <RecommendationCard
                  key={rec.id}
                  rec={rec}
                  onDismiss={handleDismiss}
                  onAction={handleAction}
                  onQuickAction={handleQuickAction}
                  index={index}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Advisor Tips (always visible at bottom) */}
      {store.buildings.length === 0 ? (
        <Card className="bg-emerald-900/10 border border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Brain className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-emerald-300">Getting Started</h4>
                <p className="text-xs text-gray-400 mt-1">
                  Welcome to Factory Dominion! Start by building a <strong className="text-cyan-300">Mining Drill</strong> to extract raw resources,
                  then a <strong className="text-yellow-300">Coal Generator</strong> to power your factory.
                  The AI Advisor will track your progress and suggest next steps.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : store.buildings.length < 5 ? (
        <Card className="bg-cyan-900/10 border border-cyan-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-cyan-300">Pro Tip</h4>
                <p className="text-xs text-gray-400 mt-1">
                  Build a variety of buildings to establish production chains. Raw resources need processing factories
                  to become valuable products. Check the Guide tab for a walkthrough!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
