// ============================================
// FACTORY DOMINION: LLM News Text Generation Module
// ============================================
//
// HYBRID news generation system:
//   1. Deterministic fallback — always available, template-based (never fails)
//   2. LLM enhancement — optional, improves text quality via server-side API
//
// Key Design Principles:
//   - LLM is ONLY a language layer — it rewrites text, does NOT change meaning or data
//   - Deterministic fallback ALWAYS works (even if LLM is down)
//   - Server-side LLM via z-ai-web-dev-sdk (called through /api/news-llm)
//   - Async, non-blocking (UI must never freeze)
//   - Cache repeated outputs for identical EventPackets
//   - Limit LLM calls per tick (max 3)
//   - If LLM fails/slow/unavailable → instant deterministic fallback
// ============================================

import { ResourceType } from './types';
import { RESOURCE_META } from './data';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventPacket {
  type: 'price_move' | 'volatility' | 'sector' | 'trade';
  resource: string;
  delta: string; // e.g. "+6.2%"
  severity: 'low' | 'medium' | 'high';
  context: {
    cause?: string; // e.g. "supply shortage"
    region?: string; // e.g. "North"
    sectorName?: string; // e.g. "Raw Minerals"
    source?: string; // e.g. "micro" | "macro" | "chain"
    volume?: number;
    trend?: string;
    oldPrice?: number;
    newPrice?: number;
    basePrice?: number;
  };
}

export interface NewsTextResult {
  title: string;
  description: string;
  source: 'llm' | 'fallback'; // track which source generated the text
  generationTimeMs: number; // performance tracking
}

export type LLMLoadState = 'idle' | 'ready' | 'failed' | 'unsupported';

export interface LLMEngineState {
  loadState: LLMLoadState;
  model: string | null;
  backend: 'server' | null;
  averageGenTimeMs: number;
  totalCalls: number;
  cacheHits: number;
  llmSuccesses: number;
  llmFailures: number;
}

// ─── Internal State ──────────────────────────────────────────────────────────

let engineState: LLMEngineState = {
  loadState: 'idle',
  model: null,
  backend: null,
  averageGenTimeMs: 0,
  totalCalls: 0,
  cacheHits: 0,
  llmSuccesses: 0,
  llmFailures: 0,
};

let generationQueue: Array<{
  packet: EventPacket;
  resolve: (result: NewsTextResult) => void;
}> = [];
let isProcessingQueue = false;
let llmCallCountThisTick = 0;
let lastTickReset = 0;
let disabledUntil = 0; // timestamp when LLM was temporarily disabled
let genTimeSamples: number[] = [];
let apiHealthChecked = false;

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LLM_CALLS_PER_TICK = 3;
const LLM_CALL_TIMEOUT_MS = 8000;
const SLOW_LLM_THRESHOLD_MS = 5000;
const DISABLE_DURATION_MS = 30000;
const CACHE_MAX_SIZE = 100;
const API_ROUTE = '/api/news-llm';

// ─── LRU Cache ────────────────────────────────────────────────────────────────

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

const newsCache = new LRUCache<string, NewsTextResult>();

// ─── Hashing ──────────────────────────────────────────────────────────────────

function hashPacket(packet: EventPacket): string {
  const parts = [
    packet.type,
    packet.resource,
    packet.delta,
    packet.severity,
    packet.context.cause ?? '',
    packet.context.region ?? '',
    packet.context.sectorName ?? '',
    packet.context.source ?? '',
    packet.context.volume?.toString() ?? '',
    packet.context.trend ?? '',
    packet.context.oldPrice?.toString() ?? '',
    packet.context.newPrice?.toString() ?? '',
    packet.context.basePrice?.toString() ?? '',
  ];
  return parts.join('|');
}

// ─── API Call (Server-side LLM) ──────────────────────────────────────────────

async function callLLMAPI(packet: EventPacket): Promise<NewsTextResult | null> {
  const startTime = performance.now();

  try {
    const response = await fetch(API_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packet }),
      signal: AbortSignal.timeout(LLM_CALL_TIMEOUT_MS),
    });

    const elapsed = performance.now() - startTime;

    if (!response.ok) {
      recordGenTime(elapsed);
      return null;
    }

    const data = await response.json();

    if (data.title && data.description && data.source === 'llm') {
      recordGenTime(elapsed);
      return {
        title: data.title,
        description: data.description,
        source: 'llm',
        generationTimeMs: elapsed,
      };
    }

    return null;
  } catch (error) {
    const elapsed = performance.now() - startTime;
    recordGenTime(elapsed);
    console.warn('[NewsLLM] API call failed:', error);
    return null;
  }
}

function recordGenTime(ms: number): void {
  genTimeSamples.push(ms);
  if (genTimeSamples.length > 20) {
    genTimeSamples.shift();
  }
  engineState.averageGenTimeMs =
    genTimeSamples.reduce((a, b) => a + b, 0) / genTimeSamples.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deterministic Fallback (Enhanced Templates — always available)
// ═══════════════════════════════════════════════════════════════════════════════

// Vocabulary variation sets for diverse text generation
const POSITIVE_VERBS = [
  'surge', 'soar', 'climb', 'rally', 'advance', 'jump', 'spike', 'rise',
  'escalate', 'strengthen', 'recover', 'gain', 'improve', 'ascend', 'boom',
];

const NEGATIVE_VERBS = [
  'plunge', 'dive', 'crash', 'collapse', 'tumble', 'slide', 'slip', 'drop',
  'fall', 'decline', 'retreat', 'weaken', 'deteriorate', 'sink', 'crater',
];

const POSITIVE_NOUNS = [
  'rally', 'surge', 'recovery', 'boom', 'uptick', 'gains', 'momentum',
  'breakout', 'upswing', 'advance',
];

const NEGATIVE_NOUNS = [
  'sell-off', 'crash', 'downturn', 'slump', 'decline', 'drop', 'plunge',
  'correction', 'retreat', 'downturn',
];

const CAUSE_CONNECTORS = [
  'amid', 'driven by', 'following', 'due to', 'as', 'on the back of',
  'spurred by', 'on account of', 'in response to', 'triggered by',
];

const INTENSITY_ADVERBS: Record<string, string[]> = {
  low: ['slightly', 'modestly', 'marginally', 'gently', 'softly'],
  medium: ['notably', 'significantly', 'considerably', 'markedly', 'substantially'],
  high: ['sharply', 'dramatically', 'steeply', 'drastically', 'massively'],
};

// Template index tracking to avoid repetition
const recentTemplateIndices: Record<string, number[]> = {};

function pickRandom<T>(arr: T[], avoidIndices?: number[]): { value: T; index: number } {
  if (arr.length === 0) throw new Error('Empty array');
  if (arr.length === 1) return { value: arr[0], index: 0 };

  const avoid = avoidIndices ?? [];
  const candidates = arr
    .map((_, i) => i)
    .filter((i) => !avoid.includes(i));

  if (candidates.length === 0) {
    const idx = Math.floor(Math.random() * arr.length);
    return { value: arr[idx], index: idx };
  }

  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  return { value: arr[idx], index: idx };
}

function pickVerb(isUp: boolean, avoidIndices: number[]): { value: string; index: number } {
  return pickRandom(isUp ? POSITIVE_VERBS : NEGATIVE_VERBS, avoidIndices);
}

function pickNoun(isUp: boolean): string {
  return pickRandom(isUp ? POSITIVE_NOUNS : NEGATIVE_NOUNS).value;
}

function pickAdverb(severity: 'low' | 'medium' | 'high'): string {
  return pickRandom(INTENSITY_ADVERBS[severity]).value;
}

function pickConnector(): string {
  return pickRandom(CAUSE_CONNECTORS).value;
}

function formatDelta(delta: string): { isUp: boolean; absValue: string } {
  const isUp = delta.startsWith('+') || (!delta.startsWith('-') && parseFloat(delta) >= 0);
  const absValue = delta.replace(/^[+-]/, '');
  return { isUp, absValue };
}

function resourceName(resource: string): string {
  return RESOURCE_META[resource as ResourceType]?.name ?? resource;
}

// ─── Per-Event-Type Template Systems ─────────────────────────────────────────

function generatePriceMoveText(packet: EventPacket): { title: string; description: string } {
  const { isUp, absValue } = formatDelta(packet.delta);
  const resource = resourceName(packet.resource);
  const severity = packet.severity;
  const adverb = pickAdverb(severity);
  const cause = packet.context.cause;
  const oldPrice = packet.context.oldPrice;
  const newPrice = packet.context.newPrice;

  const typeKey = `price_move_${isUp ? 'up' : 'down'}`;
  const recentIndices = recentTemplateIndices[typeKey] ?? [];

  const templates = [
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${resource} ${isUp ? 'Rises' : 'Falls'} ${absValue}`,
        description: `${resource} prices ${verb} ${absValue} to ${newPrice?.toFixed(2) ?? 'new levels'}. ${cause ? `${pickConnector()} ${cause}, ` : ''}Market participants ${isUp ? 'bullish' : 'bearish'} on the outlook.`,
      };
    },
    () => {
      const noun = pickNoun(isUp);
      return {
        title: `${resource} ${isUp ? 'Rally' : 'Sell-Off'}`,
        description: `A ${severity} ${noun} in ${resource} pushed prices ${isUp ? 'up' : 'down'} by ${absValue}. ${cause ? `The move was ${pickConnector()} ${cause}.` : 'Trading volume remains elevated.'} ${oldPrice && newPrice ? `Price moved from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}.` : ''}`,
      };
    },
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${resource} ${isUp ? 'Gains' : 'Loses'} Ground`,
        description: `${resource} ${adverb} ${verb} ${absValue} in the latest session. ${cause ? `Analysts attribute the move to ${cause}.` : 'The shift reflects changing market dynamics.'} ${newPrice ? `Current price: $${newPrice.toFixed(2)}.` : ''}`,
      };
    },
    () => ({
      title: `${isUp ? '▲' : '▼'} ${resource} ${absValue} Move`,
      description: `Breaking: ${resource} prices ${isUp ? 'surge' : 'plunge'} ${absValue} ${cause ? `after ${cause}` : 'in active trading'}. ${severity === 'high' ? 'This represents a significant market event.' : 'The move is within normal trading range.'} ${oldPrice && newPrice ? `$${oldPrice.toFixed(2)} → $${newPrice.toFixed(2)}` : ''}`,
    }),
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${resource} ${isUp ? 'Demand' : 'Supply'} Pressure`,
        description: `${isUp ? 'Increased demand' : 'Oversupply'} for ${resource} causes prices to ${verb} ${absValue}. ${cause ? `Market sources cite ${cause} as the primary factor.` : 'Supply chain adjustments are underway.'}`,
      };
    },
    () => {
      const trend = packet.context.trend;
      return {
        title: `${resource} ${trend === (isUp ? 'up' : 'down') ? 'Extends' : 'Reverses'} ${isUp ? 'Gains' : 'Losses'}`,
        description: `${resource} ${isUp ? 'continues its upward trajectory' : 'extends its downward slide'}, ${isUp ? 'rising' : 'falling'} ${absValue}. ${cause ? `The ${cause} ${isUp ? 'fuels' : 'weighs on'} sentiment.` : 'Traders are watching key support levels.'}`,
      };
    },
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${resource} ${verb.charAt(0).toUpperCase() + verb.slice(1)}s ${absValue}`,
        description: `${resource} ${adverb} ${verb}s ${absValue}. ${cause ? `Trigger: ${cause}.` : ''} ${newPrice ? `Now at $${newPrice.toFixed(2)}.` : ''}`,
      };
    },
  ];

  const { value, index } = pickRandom(templates, recentIndices);
  recentTemplateIndices[typeKey] = [...(recentTemplateIndices[typeKey] ?? []), index].slice(-4);
  return value();
}

function generateVolatilityText(packet: EventPacket): { title: string; description: string } {
  const { isUp } = formatDelta(packet.delta);
  const resource = resourceName(packet.resource);
  const severity = packet.severity;
  const source = packet.context.source;
  const cause = packet.context.cause;
  const sectorName = packet.context.sectorName;

  const typeKey = `volatility_${isUp ? 'up' : 'down'}`;
  const recentIndices = recentTemplateIndices[typeKey] ?? [];

  const templates = [
    () => ({
      title: `${resource} Volatility Spike`,
      description: `${resource} is experiencing ${severity} volatility, with prices ${isUp ? 'swinging upward' : 'swinging downward'} by ${packet.delta}. ${source === 'macro' ? 'A macro-economic event is driving market uncertainty.' : source === 'chain' ? 'Cascading effects are amplifying price swings.' : 'Short-term supply disruptions are causing instability.'}`,
    }),
    () => ({
      title: `${sectorName ?? resource} Turbulence`,
      description: `Market turbulence detected in ${sectorName ?? resource}. ${resource} prices ${isUp ? 'spike' : 'drop'} ${packet.delta} as ${cause ?? 'volatility intensifies'}. ${severity === 'high' ? 'Risk management protocols advised.' : 'Normal market fluctuations observed.'}`,
    }),
    () => {
      const adverb = pickAdverb(severity);
      return {
        title: `${isUp ? 'Upward' : 'Downward'} Pressure on ${resource}`,
        description: `${resource} faces ${adverb} ${isUp ? 'upward' : 'downward'} pressure (${packet.delta}). ${cause ? `Source: ${cause}.` : ''} ${source === 'micro' ? 'Local market conditions are shifting.' : source === 'macro' ? 'Sector-wide forces are at play.' : 'Chain reaction effects are spreading through the market.'}`,
      };
    },
    () => ({
      title: `${resource} ${severity === 'high' ? 'Risk Alert' : 'Volatility Notice'}`,
      description: `${resource} shows ${severity} volatility with a ${packet.delta} move. ${cause ? `Underlying cause: ${cause}.` : 'Market participants should monitor positions closely.'} ${isUp ? 'Buyers are aggressive.' : 'Sellers dominate the order book.'}`,
    }),
    () => ({
      title: `${resource} Breaks Stability`,
      description: `${resource} breaks from its recent trading range, moving ${packet.delta} ${isUp ? 'higher' : 'lower'}. ${source === 'macro' ? `A macro event disrupted the ${sectorName ?? 'market'} equilibrium.` : source === 'chain' ? 'Correlation-driven cascades are in effect.' : 'Micro-level disruptions are the catalyst.'} ${cause ? `Factor: ${cause}.` : ''}`,
    }),
    () => ({
      title: `${resource} Momentum ${isUp ? 'Builds' : 'Weakens'}`,
      description: `${isUp ? 'Bullish' : 'Bearish'} momentum is building in ${resource}, with a ${packet.delta} shift. ${cause ? `The move is attributed to ${cause}.` : 'Market sentiment is shifting.'} ${sectorName ? `${sectorName} sector is experiencing ${severity} turbulence.` : ''}`,
    }),
    () => ({
      title: `${isUp ? '▲' : '▼'} ${resource} Volatility`,
      description: `${resource} volatility ${isUp ? 'spikes' : 'surges'} (${packet.delta}). ${cause ?? 'Market dynamics shifting'}. ${severity === 'high' ? 'High risk environment.' : 'Moderate market activity.'}`,
    }),
  ];

  const { value, index } = pickRandom(templates, recentIndices);
  recentTemplateIndices[typeKey] = [...(recentTemplateIndices[typeKey] ?? []), index].slice(-4);
  return value();
}

function generateSectorText(packet: EventPacket): { title: string; description: string } {
  const { isUp, absValue } = formatDelta(packet.delta);
  const sectorName = packet.context.sectorName ?? resourceName(packet.resource);
  const severity = packet.severity;
  const cause = packet.context.cause;

  const typeKey = `sector_${isUp ? 'up' : 'down'}`;
  const recentIndices = recentTemplateIndices[typeKey] ?? [];

  const templates = [
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${sectorName} Sector ${isUp ? 'Rally' : 'Downturn'}`,
        description: `${sectorName} sector ${verb}s across the board, with average moves of ${absValue}. ${cause ? `The shift is driven by ${cause}.` : 'Broad market forces are at play.'} ${severity === 'high' ? 'Investor sentiment has shifted significantly.' : 'Normal sector rotation observed.'}`,
      };
    },
    () => ({
      title: `${sectorName} ${isUp ? 'Gains' : 'Losses'} ${absValue}`,
      description: `Broad ${isUp ? 'gains' : 'losses'} in the ${sectorName} sector as prices ${isUp ? 'rise' : 'fall'} ${absValue}. ${cause ? `Analysts point to ${cause} as the primary catalyst.` : 'Multiple factors are contributing to the sector move.'} ${isUp ? 'Investor confidence is growing.' : 'Market participants are cautious.'}`,
    }),
    () => ({
      title: `${sectorName} ${isUp ? 'Rotation In' : 'Rotation Out'}`,
      description: `Capital is ${isUp ? 'flowing into' : 'exiting'} the ${sectorName} sector, driving a ${absValue} ${isUp ? 'increase' : 'decrease'}. ${cause ? `Sector rotation triggered by ${cause}.` : 'Portfolio rebalancing is underway.'} ${severity === 'high' ? 'This is a major sector rotation event.' : ''}`,
    }),
    () => ({
      title: `Macro Shift Hits ${sectorName}`,
      description: `A macro-economic shift is ${isUp ? 'boosting' : 'pressuring'} the ${sectorName} sector, with prices moving ${absValue} ${isUp ? 'higher' : 'lower'}. ${cause ? `The driver: ${cause}.` : 'Economic indicators are shifting.'} ${severity === 'high' ? 'Significant macro implications expected.' : 'Limited broader impact anticipated.'}`,
    }),
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${sectorName} ${isUp ? 'Bull' : 'Bear'} Trend`,
        description: `${sectorName} continues its ${isUp ? 'bullish' : 'bearish'} trend as the sector ${verb}s ${absValue}. ${cause ? `${pickConnector()} ${cause}, ` : ''}the trend shows no signs of ${isUp ? 'reversing' : 'bottoming'}.`,
      };
    },
    () => ({
      title: `${sectorName} Performance Update`,
      description: `${sectorName} sector performance: ${isUp ? '▲' : '▼'} ${absValue} average change. ${cause ? `Key factor: ${cause}.` : ''} ${severity === 'high' ? 'Major sector movement in progress.' : 'Moderate performance variation.'} ${isUp ? 'Outperforming the broader market.' : 'Underperforming market averages.'}`,
    }),
    () => {
      const noun = pickNoun(isUp);
      return {
        title: `${sectorName} Sector ${isUp ? 'Advance' : 'Decline'}`,
        description: `The ${sectorName} sector is in the midst of a ${severity} ${noun}, moving ${absValue}. ${cause ? `Market observers link this to ${cause}.` : ''} ${isUp ? 'Growth prospects are improving.' : 'Headwinds are strengthening.'}`,
      };
    },
  ];

  const { value, index } = pickRandom(templates, recentIndices);
  recentTemplateIndices[typeKey] = [...(recentTemplateIndices[typeKey] ?? []), index].slice(-4);
  return value();
}

function generateTradeText(packet: EventPacket): { title: string; description: string } {
  const { isUp } = formatDelta(packet.delta);
  const resource = resourceName(packet.resource);
  const severity = packet.severity;
  const volume = packet.context.volume;
  const cause = packet.context.cause;

  const typeKey = `trade_${isUp ? 'up' : 'down'}`;
  const recentIndices = recentTemplateIndices[typeKey] ?? [];

  const templates = [
    () => ({
      title: `${resource} Volume Surge`,
      description: `Unusual trading volume detected in ${resource}. ${volume ? `${volume.toFixed(0)} units traded. ` : ''}${isUp ? 'Heavy buying pressure' : 'Aggressive selling'} is driving prices ${isUp ? 'up' : 'down'} by ${packet.delta}. ${cause ? `Activity linked to ${cause}.` : 'Source of the volume spike is unclear.'}`,
    }),
    () => ({
      title: `${resource} Order Imbalance`,
      description: `Significant order imbalance in ${resource} market, with ${isUp ? 'bids dominating' : 'asks overwhelming'}. Price ${isUp ? 'rises' : 'falls'} ${packet.delta}. ${volume ? `Volume: ${volume.toFixed(0)} units.` : ''} ${severity === 'high' ? 'Market makers are adjusting spreads.' : 'Liquidity remains adequate.'}`,
    }),
    () => ({
      title: `${isUp ? 'Heavy' : 'Notable'} ${resource} ${isUp ? 'Buying' : 'Selling'}`,
      description: `${isUp ? 'Strong accumulation' : 'Heavy distribution'} of ${resource} detected. Prices ${isUp ? 'rise' : 'fall'} ${packet.delta} on ${volume ? `${volume.toFixed(0)} units` : 'elevated volume'}. ${cause ? `Traders cite ${cause}.` : 'Activity suggests informed trading.'}`,
    }),
    () => ({
      title: `${resource} Trade Flow Alert`,
      description: `${isUp ? 'Capital inflows' : 'Capital outflows'} detected in ${resource}, moving the market ${packet.delta}. ${volume ? `Total volume: ${volume.toFixed(0)} units. ` : ''}${severity === 'high' ? 'Large institutional activity suspected.' : 'Normal trading patterns with elevated activity.'} ${cause ? `Cause: ${cause}.` : ''}`,
    }),
    () => ({
      title: `${resource} ${isUp ? 'Accumulation' : 'Distribution'}`,
      description: `${isUp ? 'Large buyers' : 'Major sellers'} are active in the ${resource} market, pushing prices ${isUp ? 'up' : 'down'} ${packet.delta}. ${volume ? `Volume reached ${volume.toFixed(0)} units.` : ''} ${cause ? `Reason: ${cause}.` : 'Market depth is shifting.'}`,
    }),
    () => ({
      title: `${isUp ? '▲' : '▼'} ${resource} Trade Activity`,
      description: `${resource} trading ${isUp ? 'spikes' : 'surges'} — ${packet.delta} move. ${volume ? `${volume.toFixed(0)} units exchanged.` : ''} ${cause ?? 'Unusual activity'}. ${severity === 'high' ? 'Significant market impact.' : ''}`,
    }),
    () => {
      const verb = isUp ? 'accumulate' : 'offload';
      return {
        title: `${resource} Positions Shift`,
        description: `Traders ${verb} ${resource} positions, driving a ${packet.delta} price change. ${volume ? `Volume: ${volume.toFixed(0)} units.` : ''} ${cause ? `Catalyst: ${cause}.` : ''} ${severity === 'high' ? 'Major position rebalancing underway.' : 'Moderate positioning adjustment.'}`,
      };
    },
  ];

  const { value, index } = pickRandom(templates, recentIndices);
  recentTemplateIndices[typeKey] = [...(recentTemplateIndices[typeKey] ?? []), index].slice(-4);
  return value();
}

// ─── Fallback Main Entry ─────────────────────────────────────────────────────

function generateFallbackText(packet: EventPacket): { title: string; description: string } {
  switch (packet.type) {
    case 'price_move':
      return generatePriceMoveText(packet);
    case 'volatility':
      return generateVolatilityText(packet);
    case 'sector':
      return generateSectorText(packet);
    case 'trade':
      return generateTradeText(packet);
    default:
      return generatePriceMoveText(packet);
  }
}

// ─── Queue Processing ────────────────────────────────────────────────────────

async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  if (generationQueue.length === 0) return;

  isProcessingQueue = true;

  try {
    while (generationQueue.length > 0) {
      const item = generationQueue.shift();
      if (!item) break;

      const { packet, resolve } = item;

      // Check tick budget
      if (llmCallCountThisTick >= MAX_LLM_CALLS_PER_TICK) {
        const fallback = generateFallbackText(packet);
        resolve({ ...fallback, source: 'fallback', generationTimeMs: 0 });
        continue;
      }

      // Check if LLM is temporarily disabled
      if (Date.now() < disabledUntil) {
        const fallback = generateFallbackText(packet);
        resolve({ ...fallback, source: 'fallback', generationTimeMs: 0 });
        continue;
      }

      // Check if API is ready
      if (engineState.loadState !== 'ready') {
        const fallback = generateFallbackText(packet);
        resolve({ ...fallback, source: 'fallback', generationTimeMs: 0 });
        continue;
      }

      // Try server-side LLM
      const llmResult = await callLLMAPI(packet);
      llmCallCountThisTick++;
      engineState.totalCalls++;

      if (llmResult) {
        engineState.llmSuccesses++;
        // Check if LLM is too slow
        if (engineState.averageGenTimeMs > SLOW_LLM_THRESHOLD_MS) {
          disabledUntil = Date.now() + DISABLE_DURATION_MS;
          console.warn(
            `[NewsLLM] LLM too slow (avg ${engineState.averageGenTimeMs.toFixed(0)}ms). Disabling for ${DISABLE_DURATION_MS / 1000}s.`
          );
        }
        resolve(llmResult);
      } else {
        engineState.llmFailures++;
        const fallback = generateFallbackText(packet);
        resolve({ ...fallback, source: 'fallback', generationTimeMs: 0 });
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the LLM news system.
 * Marks as ready — the actual API will be tested on first call.
 * This avoids wasting an LLM call on a health check.
 */
export async function initNewsLLM(): Promise<void> {
  if (engineState.loadState !== 'idle') return;

  // Only initialize in browser environment
  if (typeof window === 'undefined') {
    engineState.loadState = 'unsupported';
    return;
  }

  // Skip health check — just mark as ready.
  // The first generateNewsText() call will test the API.
  // If the API fails, we'll fall back to deterministic templates.
  engineState.loadState = 'ready';
  engineState.model = 'z-ai-web-dev-sdk';
  engineState.backend = 'server';
  apiHealthChecked = true;
}

/**
 * Generate news text from an EventPacket.
 * This is the MAIN function called from the game engine.
 *
 * - First checks cache for identical packet
 * - If LLM available and ready, calls server-side API
 * - If LLM fails or takes too long, uses deterministic fallback
 * - Always returns a valid result (never throws)
 */
export async function generateNewsText(packet: EventPacket): Promise<NewsTextResult> {
  const startTime = performance.now();

  try {
    // 1. Check cache
    const cacheKey = hashPacket(packet);
    const cached = newsCache.get(cacheKey);
    if (cached) {
      engineState.cacheHits++;
      return { ...cached, generationTimeMs: performance.now() - startTime };
    }

    // 2. Reset tick budget if new tick
    const currentTick = Math.floor(Date.now() / 1000);
    if (currentTick !== lastTickReset) {
      lastTickReset = currentTick;
      llmCallCountThisTick = 0;
    }

    // 3. Determine if we should use LLM or fallback
    const canUseLLM =
      engineState.loadState === 'ready' &&
      llmCallCountThisTick < MAX_LLM_CALLS_PER_TICK &&
      Date.now() >= disabledUntil;

    if (canUseLLM) {
      // Use the queue for serial execution
      const result = await new Promise<NewsTextResult>((resolve) => {
        generationQueue.push({ packet, resolve });
        processQueue();
      });

      // Cache the result
      newsCache.set(cacheKey, result);
      return result;
    }

    // 4. Fallback path
    const fallback = generateFallbackText(packet);
    const result: NewsTextResult = {
      ...fallback,
      source: 'fallback',
      generationTimeMs: performance.now() - startTime,
    };

    // Cache the fallback result too
    newsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    // Ultimate safety net — never throw
    console.warn('[NewsLLM] Unexpected error in generateNewsText:', error);
    const fallback = generateFallbackText(packet);
    return {
      ...fallback,
      source: 'fallback',
      generationTimeMs: performance.now() - startTime,
    };
  }
}

/**
 * Return current engine state for UI display.
 */
export function getLLMState(): LLMEngineState {
  return { ...engineState };
}

/**
 * Reset the per-tick LLM call budget.
 * Call this at the start of each game tick.
 */
export function resetTickBudget(): void {
  llmCallCountThisTick = 0;
}

/**
 * Clean up resources held by the LLM engine.
 */
export function shutdownNewsLLM(): void {
  engineState = {
    loadState: 'idle',
    model: null,
    backend: null,
    averageGenTimeMs: 0,
    totalCalls: 0,
    cacheHits: 0,
    llmSuccesses: 0,
    llmFailures: 0,
  };
  generationQueue = [];
  isProcessingQueue = false;
  newsCache.clear();
  genTimeSamples = [];
  disabledUntil = 0;
  llmCallCountThisTick = 0;
  apiHealthChecked = false;
}
