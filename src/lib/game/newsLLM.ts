// ============================================
// FACTORY DOMINION: Local LLM News Text Generation Module
// ============================================
//
// HYBRID news generation system:
//   1. Deterministic fallback — always available, template-based (never fails)
//   2. LLM enhancement — optional, improves text quality when available
//
// Key Design Principles:
//   - LLM is ONLY a language layer — it rewrites text, does NOT change meaning or data
//   - Must work in browser AND mobile browser
//   - WebGPU preferred, WebAssembly/transformers.js fallback
//   - Async, non-blocking (UI must never freeze)
//   - Cache repeated outputs for identical EventPackets
//   - Limit LLM calls per tick (max 1-3)
//   - If LLM fails/slow/unavailable → instant deterministic fallback
// ============================================

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

export type LLMLoadState = 'idle' | 'loading' | 'ready' | 'failed' | 'unsupported';

export interface LLMEngineState {
  loadState: LLMLoadState;
  model: string | null;
  backend: 'webgpu' | 'wasm' | null;
  averageGenTimeMs: number;
  totalCalls: number;
  cacheHits: number;
}

// ─── Internal State ──────────────────────────────────────────────────────────

let engineState: LLMEngineState = {
  loadState: 'idle',
  model: null,
  backend: null,
  averageGenTimeMs: 0,
  totalCalls: 0,
  cacheHits: 0,
};

let pipeline: unknown = null; // transformers.js text-generation pipeline
let generationQueue: Array<{
  packet: EventPacket;
  resolve: (result: NewsTextResult) => void;
}> = [];
let isProcessingQueue = false;
let llmCallCountThisTick = 0;
let lastTickReset = 0;
let disabledUntil = 0; // timestamp when LLM was temporarily disabled
let genTimeSamples: number[] = [];

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_LLM_CALLS = 1;
const MAX_LLM_CALLS_PER_TICK = 3;
const LLM_CALL_TIMEOUT_MS = 3000;
const SLOW_LLM_THRESHOLD_MS = 2000;
const DISABLE_DURATION_MS = 60000;
const CACHE_MAX_SIZE = 100;

// ─── LRU Cache ────────────────────────────────────────────────────────────────

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    // Move to end (most recently used)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry)
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
  // Deterministic hash of the packet fields for cache key
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

// ─── LLM System & User Prompts ───────────────────────────────────────────────

const LLM_SYSTEM_PROMPT = `You are a financial news writer for a market simulation game called Factory Dominion. Write concise, professional market news.

STRICT RULES:
- Do NOT invent new data or numbers
- Do NOT change any percentages or values
- Do NOT change resource names
- Do NOT add fake causes or events
- Only rewrite into natural, varied news text
- Keep meaning identical to the input
- Output MUST be 1-5 sentences
- Output MUST be valid JSON: {"title": "...", "description": "..."}
- Title must be short (3-8 words)
- Description must be 1-5 sentences`;

function buildUserPrompt(packet: EventPacket): string {
  return `Rewrite this market event into news text:\n${JSON.stringify(packet)}`;
}

// ─── WebGPU Detection ─────────────────────────────────────────────────────────

async function detectWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      return false;
    }
    const adapter = await (navigator as Record<string, unknown>).gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// ─── LLM Initialization ──────────────────────────────────────────────────────

/**
 * Initialize the local LLM engine.
 * Tries WebGPU first, then WASM backend.
 * If neither works, marks as 'unsupported' — fallback only.
 * This should be called once on game init, but the game must work WITHOUT calling it.
 */
export async function initNewsLLM(): Promise<void> {
  if (engineState.loadState !== 'idle') return;

  // Only initialize in browser environment
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    engineState.loadState = 'unsupported';
    return;
  }

  engineState.loadState = 'loading';

  try {
    // Dynamic import — @huggingface/transformers may not be installed
    // Use indirect dynamic import to prevent webpack from resolving at build time
    let transformersModule: { pipeline: typeof import('@huggingface/transformers').pipeline; env: typeof import('@huggingface/transformers').env } | null = null;
    try {
      // Indirect reference avoids webpack module resolution at build time
      const moduleName = '@huggingface' + '/transformers';
      transformersModule = await import(/* webpackIgnore: true */ moduleName) as typeof transformersModule;
    } catch {
      // transformers.js not available — this is expected if package not installed
      engineState.loadState = 'unsupported';
      engineState.model = null;
      engineState.backend = null;
      return;
    }

    // Detect backend
    const hasWebGPU = await detectWebGPU();
    const backend: 'webgpu' | 'wasm' = hasWebGPU ? 'webgpu' : 'wasm';

    // Configure device
    const device = hasWebGPU ? 'webgpu' : 'wasm';

    // Try to load a small text-generation model
    // TinyLlama 1.1B Chat is a good balance of quality and size
    const modelId = 'Xenova/TinyLlama-1.1B-Chat-v1.0';

    const createPipeline = transformersModule.pipeline;

    // Set backend preference
    try {
      const env = transformersModule.env;
      if (hasWebGPU && env?.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.proxy = false;
      }
    } catch {
      // env configuration is optional
    }

    const pipe = await createPipeline('text-generation', modelId, {
      device,
      dtype: hasWebGPU ? 'fp32' : 'q4',
    });

    pipeline = pipe;
    engineState.loadState = 'ready';
    engineState.model = modelId;
    engineState.backend = backend;
  } catch (error) {
    console.warn('[NewsLLM] Failed to initialize LLM engine:', error);
    engineState.loadState = 'failed';
    engineState.model = null;
    engineState.backend = null;
    pipeline = null;
  }
}

// ─── LLM Generation (with timeout) ──────────────────────────────────────────

async function callLLMWithTimeout(packet: EventPacket): Promise<NewsTextResult | null> {
  if (!pipeline) return null;

  const startTime = performance.now();

  try {
    const result = await Promise.race([
      runLLMPipeline(packet),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), LLM_CALL_TIMEOUT_MS)
      ),
    ]);

    if (result === null) {
      // Timed out
      const elapsed = performance.now() - startTime;
      recordGenTime(elapsed);
      return null;
    }

    const elapsed = performance.now() - startTime;
    recordGenTime(elapsed);

    return result;
  } catch (error) {
    console.warn('[NewsLLM] LLM generation failed:', error);
    return null;
  }
}

async function runLLMPipeline(packet: EventPacket): Promise<NewsTextResult | null> {
  if (!pipeline) return null;

  const startTime = performance.now();

  try {
    // Use the transformers.js pipeline
    const pipe = pipeline as {
      (messages: Array<{ role: string; content: string }>, options: Record<string, unknown>): Promise<Array<{ generated_text: string }>>;
    };

    const messages = [
      { role: 'system', content: LLM_SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(packet) },
    ];

    const output = await pipe(messages, {
      max_new_tokens: 150,
      temperature: 0.7,
      do_sample: true,
      return_full_text: false,
    });

    const generatedText = output?.[0]?.generated_text ?? '';
    const elapsed = performance.now() - startTime;

    // Parse the JSON output from the LLM
    const parsed = parseLLMOutput(generatedText, packet);
    if (parsed) {
      return {
        ...parsed,
        source: 'llm',
        generationTimeMs: elapsed,
      };
    }

    return null;
  } catch (error) {
    console.warn('[NewsLLM] Pipeline execution failed:', error);
    return null;
  }
}

function parseLLMOutput(
  text: string,
  packet: EventPacket
): { title: string; description: string } | null {
  try {
    // Try to extract JSON from the response
    // The LLM might wrap it in markdown code blocks or add extra text
    let jsonStr = text.trim();

    // Extract JSON from markdown code block if present
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Try to find JSON object in the text
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.title === 'string' &&
      typeof parsed.description === 'string' &&
      parsed.title.length > 0 &&
      parsed.description.length > 0
    ) {
      // Validate: title should be short (3-8 words)
      const titleWords = parsed.title.split(/\s+/).length;
      if (titleWords < 2 || titleWords > 12) {
        // If title is too long or too short, use fallback title with LLM description
        return {
          title: generateFallbackTitle(packet),
          description: parsed.description.slice(0, 300),
        };
      }

      // Sanitize: ensure no completely fabricated data
      // (basic check — make sure the resource name appears somewhere)
      const resourceMentioned =
        parsed.title.toLowerCase().includes(packet.resource.toLowerCase()) ||
        parsed.description.toLowerCase().includes(packet.resource.toLowerCase());

      if (!resourceMentioned) {
        // LLM might have renamed the resource — inject it
        return {
          title: parsed.title,
          description: `${packet.resource} — ${parsed.description}`,
        };
      }

      return {
        title: parsed.title.slice(0, 100),
        description: parsed.description.slice(0, 300),
      };
    }

    return null;
  } catch {
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

// ─── Deterministic Fallback (Enhanced) ───────────────────────────────────────

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

  // Try to avoid recently used indices
  const avoid = avoidIndices ?? [];
  const candidates = arr
    .map((_, i) => i)
    .filter((i) => !avoid.includes(i));

  if (candidates.length === 0) {
    // All recently used, pick any
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

// ─── Per-Event-Type Template Systems ─────────────────────────────────────────

// price_move templates
function generatePriceMoveText(packet: EventPacket): { title: string; description: string } {
  const { isUp, absValue } = formatDelta(packet.delta);
  const resource = packet.resource;
  const severity = packet.severity;
  const adverb = pickAdverb(severity);
  const cause = packet.context.cause;
  const oldPrice = packet.context.oldPrice;
  const newPrice = packet.context.newPrice;

  const typeKey = `price_move_${isUp ? 'up' : 'down'}`;
  const recentIndices = recentTemplateIndices[typeKey] ?? [];

  // 7+ template variants
  const templates = [
    // Template 0: Direct price move
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${resource} ${isUp ? 'Rises' : 'Falls'} ${absValue}`,
        description: `${resource} prices ${verb} ${absValue} to ${newPrice?.toFixed(2) ?? 'new levels'}. ${cause ? `${pickConnector()} ${cause}, ` : ''}Market participants ${isUp ? 'bullish' : 'bearish'} on the outlook.`,
      };
    },
    // Template 1: Market action
    () => {
      const noun = pickNoun(isUp);
      return {
        title: `${resource} ${isUp ? 'Rally' : 'Sell-Off'}`,
        description: `A ${severity} ${noun} in ${resource} pushed prices ${isUp ? 'up' : 'down'} by ${absValue}. ${cause ? `The move was ${pickConnector()} ${cause}.` : 'Trading volume remains elevated.'} ${oldPrice && newPrice ? `Price moved from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}.` : ''}`,
      };
    },
    // Template 2: Analyst-style
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${resource} ${isUp ? 'Gains' : 'Loses'} Ground`,
        description: `${resource} ${adverb} ${verb} ${absValue} in the latest session. ${cause ? `Analysts attribute the move to ${cause}.` : 'The shift reflects changing market dynamics.'} ${newPrice ? `Current price: $${newPrice.toFixed(2)}.` : ''}`,
      };
    },
    // Template 3: Breaking news
    () => {
      return {
        title: `${isUp ? '▲' : '▼'} ${resource} ${absValue} Move`,
        description: `Breaking: ${resource} prices ${isUp ? 'surge' : 'plunge'} ${absValue} ${cause ? `after ${cause}` : 'in active trading'}. ${severity === 'high' ? 'This represents a significant market event.' : 'The move is within normal trading range.'} ${oldPrice && newPrice ? `$${oldPrice.toFixed(2)} → $${newPrice.toFixed(2)}` : ''}`,
      };
    },
    // Template 4: Supply/demand framing
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${resource} ${isUp ? 'Demand' : 'Supply'} Pressure`,
        description: `${isUp ? 'Increased demand' : 'Oversupply'} for ${resource} causes prices to ${verb} ${absValue}. ${cause ? `Market sources cite ${cause} as the primary factor.` : 'Supply chain adjustments are underway.'}`,
      };
    },
    // Template 5: Trend continuation
    () => {
      const trend = packet.context.trend;
      return {
        title: `${resource} ${trend === (isUp ? 'up' : 'down') ? 'Extends' : 'Reverses'} ${isUp ? 'Gains' : 'Losses'}`,
        description: `${resource} ${isUp ? 'continues its upward trajectory' : 'extends its downward slide'}, ${isUp ? 'rising' : 'falling'} ${absValue}. ${cause ? `The ${cause} ${isUp ? 'fuels' : 'weighs on'} sentiment.` : 'Traders are watching key support levels.'}`,
      };
    },
    // Template 6: Short punchy
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${resource} ${verb.charAt(0).toUpperCase() + verb.slice(1)}s ${absValue}`,
        description: `${resource} ${adverb} ${verb}s ${absValue}. ${cause ? `Trigger: ${cause}.` : ''} ${newPrice ? `Now at $${newPrice.toFixed(2)}.` : ''}`,
      };
    },
  ];

  // Pick template avoiding recent
  const { value, index } = pickRandom(templates, recentIndices);

  // Track recently used
  recentTemplateIndices[typeKey] = [...(recentTemplateIndices[typeKey] ?? []), index].slice(-4);

  return value();
}

// volatility templates
function generateVolatilityText(packet: EventPacket): { title: string; description: string } {
  const { isUp } = formatDelta(packet.delta);
  const resource = packet.resource;
  const severity = packet.severity;
  const source = packet.context.source;
  const cause = packet.context.cause;
  const sectorName = packet.context.sectorName;

  const typeKey = `volatility_${isUp ? 'up' : 'down'}`;
  const recentIndices = recentTemplateIndices[typeKey] ?? [];

  const templates = [
    // Template 0: Volatility spike
    () => ({
      title: `${resource} Volatility Spike`,
      description: `${resource} is experiencing ${severity} volatility, with prices ${isUp ? 'swinging upward' : 'swinging downward'} by ${packet.delta}. ${source === 'macro' ? 'A macro-economic event is driving market uncertainty.' : source === 'chain' ? 'Cascading effects are amplifying price swings.' : 'Short-term supply disruptions are causing instability.'}`,
    }),
    // Template 1: Market turbulence
    () => ({
      title: `${sectorName ?? resource} Turbulence`,
      description: `Market turbulence detected in ${sectorName ?? resource}. ${resource} prices ${isUp ? 'spike' : 'drop'} ${packet.delta} as ${cause ?? 'volatility intensifies'}. ${severity === 'high' ? 'Risk management protocols advised.' : 'Normal market fluctuations observed.'}`,
    }),
    // Template 2: Injection-based
    () => {
      const adverb = pickAdverb(severity);
      return {
        title: `${isUp ? 'Upward' : 'Downward'} Pressure on ${resource}`,
        description: `${resource} faces ${adverb} ${isUp ? 'upward' : 'downward'} pressure (${packet.delta}). ${cause ? `Source: ${cause}.` : ''} ${source === 'micro' ? 'Local market conditions are shifting.' : source === 'macro' ? 'Sector-wide forces are at play.' : 'Chain reaction effects are spreading through the market.'}`,
      };
    },
    // Template 3: Risk alert
    () => ({
      title: `${resource} ${severity === 'high' ? 'Risk Alert' : 'Volatility Notice'}`,
      description: `${severity === 'high' ? '⚠' : '📊'} ${resource} shows ${severity} volatility with a ${packet.delta} move. ${cause ? `Underlying cause: ${cause}.` : 'Market participants should monitor positions closely.'} ${isUp ? 'Buyers are aggressive.' : 'Sellers dominate the order book.'}`,
    }),
    // Template 4: Stability break
    () => ({
      title: `${resource} Breaks Stability`,
      description: `${resource} breaks from its recent trading range, moving ${packet.delta} ${isUp ? 'higher' : 'lower'}. ${source === 'macro' ? `A macro event disrupted the ${sectorName ?? 'market'} equilibrium.` : source === 'chain' ? 'Correlation-driven cascades are in effect.' : 'Micro-level disruptions are the catalyst.'} ${cause ? `Factor: ${cause}.` : ''}`,
    }),
    // Template 5: Momentum shift
    () => ({
      title: `${resource} Momentum ${isUp ? 'Builds' : 'Weakens'}`,
      description: `${isUp ? 'Bullish' : 'Bearish'} momentum is building in ${resource}, with a ${packet.delta} shift. ${cause ? `The move is attributed to ${cause}.` : 'Market sentiment is shifting.'} ${sectorName ? `${sectorName} sector is experiencing ${severity} turbulence.` : ''}`,
    }),
    // Template 6: Quick flash
    () => ({
      title: `${isUp ? '▲' : '▼'} ${resource} Volatility`,
      description: `${resource} volatility ${isUp ? 'spikes' : 'surges'} (${packet.delta}). ${cause ?? 'Market dynamics shifting'}. ${severity === 'high' ? 'High risk environment.' : 'Moderate market activity.'}`,
    }),
  ];

  const { value, index } = pickRandom(templates, recentIndices);
  recentTemplateIndices[typeKey] = [...(recentTemplateIndices[typeKey] ?? []), index].slice(-4);
  return value();
}

// sector templates
function generateSectorText(packet: EventPacket): { title: string; description: string } {
  const { isUp, absValue } = formatDelta(packet.delta);
  const sectorName = packet.context.sectorName ?? packet.resource;
  const severity = packet.severity;
  const cause = packet.context.cause;

  const typeKey = `sector_${isUp ? 'up' : 'down'}`;
  const recentIndices = recentTemplateIndices[typeKey] ?? [];

  const templates = [
    // Template 0: Sector-wide movement
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${sectorName} Sector ${isUp ? 'Rally' : 'Downturn'}`,
        description: `${sectorName} sector ${verb}s across the board, with average moves of ${absValue}. ${cause ? `The shift is driven by ${cause}.` : 'Broad market forces are at play.'} ${severity === 'high' ? 'Investor sentiment has shifted significantly.' : 'Normal sector rotation observed.'}`,
      };
    },
    // Template 1: Broad market
    () => ({
      title: `${sectorName} ${isUp ? 'Gains' : 'Losses'} ${absValue}`,
      description: `Broad ${isUp ? 'gains' : 'losses'} in the ${sectorName} sector as prices ${isUp ? 'rise' : 'fall'} ${absValue}. ${cause ? `Analysts point to ${cause} as the primary catalyst.` : 'Multiple factors are contributing to the sector move.'} ${isUp ? 'Investor confidence is growing.' : 'Market participants are cautious.'}`,
    }),
    // Template 2: Sector rotation
    () => ({
      title: `${sectorName} ${isUp ? 'Rotation In' : 'Rotation Out'}`,
      description: `Capital is ${isUp ? 'flowing into' : 'exiting'} the ${sectorName} sector, driving a ${absValue} ${isUp ? 'increase' : 'decrease'}. ${cause ? `Sector rotation triggered by ${cause}.` : 'Portfolio rebalancing is underway.'} ${severity === 'high' ? 'This is a major sector rotation event.' : ''}`,
    }),
    // Template 3: Macro-driven
    () => ({
      title: `Macro Shift Hits ${sectorName}`,
      description: `A macro-economic shift is ${isUp ? 'boosting' : 'pressuring'} the ${sectorName} sector, with prices moving ${absValue} ${isUp ? 'higher' : 'lower'}. ${cause ? `The driver: ${cause}.` : 'Economic indicators are shifting.'} ${severity === 'high' ? 'Significant macro implications expected.' : 'Limited broader impact anticipated.'}`,
    }),
    // Template 4: Trend
    () => {
      const verb = pickVerb(isUp, recentIndices).value;
      return {
        title: `${sectorName} ${isUp ? 'Bull' : 'Bear'} Trend`,
        description: `${sectorName} continues its ${isUp ? 'bullish' : 'bearish'} trend as the sector ${verb}s ${absValue}. ${cause ? `${pickConnector()} ${cause}, ` : ''}the trend shows no signs of ${isUp ? 'reversing' : 'bottoming'}.`,
      };
    },
    // Template 5: Performance note
    () => ({
      title: `${sectorName} Performance Update`,
      description: `${sectorName} sector performance: ${isUp ? '▲' : '▼'} ${absValue} average change. ${cause ? `Key factor: ${cause}.` : ''} ${severity === 'high' ? 'Major sector movement in progress.' : 'Moderate performance variation.'} ${isUp ? 'Outperforming the broader market.' : 'Underperforming market averages.'}`,
    }),
    // Template 6: Summary
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

// trade templates
function generateTradeText(packet: EventPacket): { title: string; description: string } {
  const { isUp } = formatDelta(packet.delta);
  const resource = packet.resource;
  const severity = packet.severity;
  const volume = packet.context.volume;
  const cause = packet.context.cause;

  const typeKey = `trade_${isUp ? 'up' : 'down'}`;
  const recentIndices = recentTemplateIndices[typeKey] ?? [];

  const templates = [
    // Template 0: Volume alert
    () => ({
      title: `${resource} Volume Surge`,
      description: `Unusual trading volume detected in ${resource}. ${volume ? `${volume.toFixed(0)} units traded. ` : ''}${isUp ? 'Heavy buying pressure' : 'Aggressive selling'} is driving prices ${isUp ? 'up' : 'down'} by ${packet.delta}. ${cause ? `Activity linked to ${cause}.` : 'Source of the volume spike is unclear.'}`,
    }),
    // Template 1: Order imbalance
    () => ({
      title: `${resource} Order Imbalance`,
      description: `Significant order imbalance in ${resource} market, with ${isUp ? 'bids dominating' : 'asks overwhelming'}. Price ${isUp ? 'rises' : 'falls'} ${packet.delta}. ${volume ? `Volume: ${volume.toFixed(0)} units.` : ''} ${severity === 'high' ? 'Market makers are adjusting spreads.' : 'Liquidity remains adequate.'}`,
    }),
    // Template 2: Unusual activity
    () => ({
      title: `${isUp ? 'Heavy' : 'Notable'} ${resource} Selling`,
      description: `${isUp ? 'Strong accumulation' : 'Heavy distribution'} of ${resource} detected. Prices ${isUp ? 'rise' : 'fall'} ${packet.delta} on ${volume ? `${volume.toFixed(0)} units` : 'elevated volume'}. ${cause ? `Traders cite ${cause}.` : 'Activity suggests informed trading.'}`,
    }),
    // Template 3: Flow analysis
    () => ({
      title: `${resource} Trade Flow Alert`,
      description: `${isUp ? 'Capital inflows' : 'Capital outflows'} detected in ${resource}, moving the market ${packet.delta}. ${volume ? `Total volume: ${volume.toFixed(0)} units. ` : ''}${severity === 'high' ? 'Large institutional activity suspected.' : 'Normal trading patterns with elevated activity.'} ${cause ? `Cause: ${cause}.` : ''}`,
    }),
    // Template 4: Whales
    () => ({
      title: `${resource} ${isUp ? 'Accumulation' : 'Distribution'}`,
      description: `${isUp ? 'Large buyers' : 'Major sellers'} are active in the ${resource} market, pushing prices ${isUp ? 'up' : 'down'} ${packet.delta}. ${volume ? `Volume reached ${volume.toFixed(0)} units.` : ''} ${cause ? `Reason: ${cause}.` : 'Market depth is shifting.'}`,
    }),
    // Template 5: Brief
    () => ({
      title: `${isUp ? '▲' : '▼'} ${resource} Trade Activity`,
      description: `${resource} trading ${isUp ? 'spikes' : 'surges'} — ${packet.delta} move. ${volume ? `${volume.toFixed(0)} units exchanged.` : ''} ${cause ?? 'Unusual activity'}. ${severity === 'high' ? 'Significant market impact.' : ''}`,
    }),
    // Template 6: Position shift
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

// ─── Fallback Title Generator ────────────────────────────────────────────────

function generateFallbackTitle(packet: EventPacket): string {
  const { isUp, absValue } = formatDelta(packet.delta);
  switch (packet.type) {
    case 'price_move':
      return `${packet.resource} ${isUp ? 'Rises' : 'Falls'} ${absValue}`;
    case 'volatility':
      return `${packet.resource} Volatility Spike`;
    case 'sector':
      return `${packet.context.sectorName ?? packet.resource} ${isUp ? 'Rally' : 'Downturn'}`;
    case 'trade':
      return `${packet.resource} Volume Surge`;
    default:
      return `${packet.resource} Market Update`;
  }
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
        // Budget exhausted — use fallback
        const fallback = generateFallbackText(packet);
        resolve({
          ...fallback,
          source: 'fallback',
          generationTimeMs: 0,
        });
        continue;
      }

      // Check if LLM is temporarily disabled
      if (Date.now() < disabledUntil) {
        const fallback = generateFallbackText(packet);
        resolve({
          ...fallback,
          source: 'fallback',
          generationTimeMs: 0,
        });
        continue;
      }

      // Check if LLM is ready
      if (engineState.loadState !== 'ready' || !pipeline) {
        const fallback = generateFallbackText(packet);
        resolve({
          ...fallback,
          source: 'fallback',
          generationTimeMs: 0,
        });
        continue;
      }

      // Try LLM
      const llmResult = await callLLMWithTimeout(packet);
      llmCallCountThisTick++;
      engineState.totalCalls++;

      if (llmResult) {
        // Check if LLM is too slow
        if (engineState.averageGenTimeMs > SLOW_LLM_THRESHOLD_MS) {
          disabledUntil = Date.now() + DISABLE_DURATION_MS;
          console.warn(
            `[NewsLLM] LLM too slow (avg ${engineState.averageGenTimeMs.toFixed(0)}ms). Disabling for ${DISABLE_DURATION_MS / 1000}s.`
          );
        }
        resolve(llmResult);
      } else {
        // LLM failed, use fallback
        const fallback = generateFallbackText(packet);
        resolve({
          ...fallback,
          source: 'fallback',
          generationTimeMs: 0,
        });
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate news text from an EventPacket.
 * This is the MAIN function called from the game engine.
 *
 * - First checks cache for identical packet (hash the packet fields)
 * - If cache hit, returns cached result immediately
 * - If LLM available and ready, calls LLM with strict prompt
 * - If LLM fails or takes >3 seconds, uses deterministic fallback
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
    const currentTick = Math.floor(Date.now() / 1000); // rough tick approximation
    if (currentTick !== lastTickReset) {
      lastTickReset = currentTick;
      llmCallCountThisTick = 0;
    }

    // 3. Determine if we should use LLM or fallback
    const canUseLLM =
      engineState.loadState === 'ready' &&
      pipeline !== null &&
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
  pipeline = null;
  engineState = {
    loadState: 'idle',
    model: null,
    backend: null,
    averageGenTimeMs: 0,
    totalCalls: 0,
    cacheHits: 0,
  };
  generationQueue = [];
  isProcessingQueue = false;
  newsCache.clear();
  genTimeSamples = [];
  disabledUntil = 0;
  llmCallCountThisTick = 0;
}
