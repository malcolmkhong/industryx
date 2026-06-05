// ============================================
// FACTORY DOMINION: LLM News Text Generation Module
// ============================================
//
// HYBRID news generation system:
//   1. Deterministic fallback — always available, template-based (never fails)
//   2. LLM enhancement — optional, improves text quality via Cloudflare Workers AI
//
// Architecture: BATCHED event processing
//   - Events accumulate in a buffer
//   - Auto-flush every 15 seconds OR when buffer reaches capacity
//   - ONE API call sends 1-8 events → receives 1-5 grouped headlines
//   - Dramatically reduces API calls vs per-event approach
//
// Key Design Principles:
//   - LLM is ONLY a language layer — it rewrites text, does NOT change meaning or data
//   - Deterministic fallback ALWAYS works (even if LLM is down)
//   - Cloudflare Workers AI via proxy route (server-side throttling + security)
//   - Async, non-blocking (UI must never freeze)
//   - Cache repeated outputs for similar event patterns
//   - 24-hour cycle budget cap (max 200 AI calls per game day)
//   - If LLM fails/slow/unavailable → instant deterministic fallback
//   - Handles 429 rate-limit with automatic retry
// ============================================

import { ResourceType } from './types';
import { RESOURCE_META } from './data';
import type { EventPacket } from './newsBuilder';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsTextResult {
  title: string;
  description: string;
  source: 'llm' | 'fallback';
  generationTimeMs: number;
  affectedResources?: string[]; // which resources this headline covers
}

export interface BatchHeadline {
  title: string;
  description: string;
  affectedResources: string[];
}

export type LLMLoadState = 'idle' | 'ready' | 'failed' | 'unsupported';

export interface LLMEngineState {
  loadState: LLMLoadState;
  model: string | null;
  backend: 'cloudflare' | null;
  averageGenTimeMs: number;
  totalCalls: number;
  totalEventsProcessed: number;
  cacheHits: number;
  llmSuccesses: number;
  llmFailures: number;
  callsThisGameDay: number;
  lastCallTimestamp: number;
  pendingBatchSize: number;
}

// ─── Internal State ──────────────────────────────────────────────────────────

let engineState: LLMEngineState = {
  loadState: 'idle',
  model: null,
  backend: null,
  averageGenTimeMs: 0,
  totalCalls: 0,
  totalEventsProcessed: 0,
  cacheHits: 0,
  llmSuccesses: 0,
  llmFailures: 0,
  callsThisGameDay: 0,
  lastCallTimestamp: 0,
  pendingBatchSize: 0,
};

// ─── Batch Buffer ────────────────────────────────────────────────────────────

interface PendingEvent {
  packet: EventPacket;
  newsId: string; // the MarketNews ID to update when LLM result arrives
}

let pendingBatch: PendingEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let lastGameDay = -1;
let genTimeSamples: number[] = [];

// ─── Recent Headlines (for anti-repetition context) ──────────────────────────

const recentHeadlines: string[] = [];
const MAX_RECENT_HEADLINES = 10;

// ─── Callback for store updates ──────────────────────────────────────────────

type NewsUpdateCallback = (updates: Array<{
  id: string;
  title: string;
  description: string;
  affectedResources?: string[];
  textSource: 'llm';
}>) => void;

let updateCallback: NewsUpdateCallback | null = null;

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_FLUSH_INTERVAL_MS = 15_000;  // Auto-flush every 15 seconds
const BATCH_MAX_SIZE = 8;                  // Max events per batch
const BATCH_MIN_SIZE = 1;                  // Min events before flushing (1 = flush even single events)
const MAX_CALLS_PER_GAME_DAY = 200;        // 24-hour budget cap
const LLM_CALL_TIMEOUT_MS = 15_000;        // Timeout for API call
const SLOW_LLM_THRESHOLD_MS = 10_000;      // Disable if avg too slow
const DISABLE_DURATION_MS = 60_000;         // 1 minute cooldown if too slow
const CACHE_MAX_SIZE = 200;
const MAX_429_RETRIES = 2;                 // Max retries on 429 rate-limit
const API_ROUTE = '/api/news-llm';
let disabledUntil = 0;                      // Timestamp when LLM was temporarily disabled

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

const newsCache = new LRUCache<string, BatchHeadline[]>(CACHE_MAX_SIZE);

// ─── Hashing ──────────────────────────────────────────────────────────────────

function hashBatch(packets: EventPacket[]): string {
  // Sort by resource+type for consistent cache keys regardless of order
  const sorted = [...packets].sort((a, b) =>
    (a.resource + a.type).localeCompare(b.resource + b.type)
  );
  return sorted.map(p =>
    `${p.type}:${p.resource}:${p.delta}:${p.severity}`
  ).join('|');
}

// ─── API Call (Cloudflare Workers AI via proxy) ──────────────────────────────

async function callCloudflareWorker(
  packets: EventPacket[],
  retryCount = 0,
): Promise<BatchHeadline[] | null> {
  const startTime = performance.now();

  try {
    const response = await fetch(API_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: packets,
        recentHeadlines: recentHeadlines.slice(-5), // last 5 for anti-repetition
      }),
      signal: AbortSignal.timeout(LLM_CALL_TIMEOUT_MS),
    });

    // ── Handle 429 Rate Limit ──
    if (response.status === 429 && retryCount < MAX_429_RETRIES) {
      let retryAfterMs = 6_000; // default retry delay
      try {
        const data = await response.json();
        if (data.retryAfterMs && typeof data.retryAfterMs === 'number') {
          retryAfterMs = data.retryAfterMs;
        }
      } catch { /* ignore parse error */ }

      console.log(`[NewsLLM] Rate limited (429). Retrying after ${retryAfterMs}ms (attempt ${retryCount + 1}/${MAX_429_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, retryAfterMs));
      return callCloudflareWorker(packets, retryCount + 1);
    }

    const elapsed = performance.now() - startTime;
    recordGenTime(elapsed);

    if (!response.ok) {
      console.warn(`[NewsLLM] API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.headlines && Array.isArray(data.headlines) && data.headlines.length > 0) {
      return data.headlines as BatchHeadline[];
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
// Batch Flush — sends accumulated events to Cloudflare Worker
// ═══════════════════════════════════════════════════════════════════════════════

async function flushBatch(): Promise<void> {
  if (isFlushing) return;
  if (pendingBatch.length === 0) return;

  isFlushing = true;

  // Take up to BATCH_MAX_SIZE events from the buffer
  const batchToSend = pendingBatch.splice(0, BATCH_MAX_SIZE);
  const packets = batchToSend.map(e => e.packet);

  // Update state
  engineState.pendingBatchSize = pendingBatch.length;

  try {
    // Check if LLM is ready
    if (engineState.loadState !== 'ready') {
      return;
    }

    // Check if temporarily disabled
    if (Date.now() < disabledUntil) {
      // Put events back so they can be tried later
      pendingBatch.unshift(...batchToSend);
      engineState.pendingBatchSize = pendingBatch.length;
      return;
    }

    // Check 24-hour budget
    if (engineState.callsThisGameDay >= MAX_CALLS_PER_GAME_DAY) {
      return;
    }

    // Check cache
    const cacheKey = hashBatch(packets);
    const cached = newsCache.get(cacheKey);
    if (cached) {
      engineState.cacheHits++;
      applyHeadlinesToStore(cached, batchToSend);
      return;
    }

    // Call Cloudflare Worker (with 429 retry built in)
    const headlines = await callCloudflareWorker(packets);
    engineState.totalCalls++;
    engineState.callsThisGameDay++;
    engineState.lastCallTimestamp = Date.now();

    if (headlines && headlines.length > 0) {
      engineState.llmSuccesses++;
      engineState.totalEventsProcessed += packets.length;

      // Cache the result
      newsCache.set(cacheKey, headlines);

      // Track recent headlines for anti-repetition
      for (const h of headlines) {
        recentHeadlines.push(h.title);
        if (recentHeadlines.length > MAX_RECENT_HEADLINES) {
          recentHeadlines.shift();
        }
      }

      // Apply to store
      applyHeadlinesToStore(headlines, batchToSend);

      // Check if LLM is too slow
      if (engineState.averageGenTimeMs > SLOW_LLM_THRESHOLD_MS) {
        disabledUntil = Date.now() + DISABLE_DURATION_MS;
        console.warn(
          `[NewsLLM] LLM too slow (avg ${engineState.averageGenTimeMs.toFixed(0)}ms). Disabling for ${DISABLE_DURATION_MS / 1000}s.`
        );
      }
    } else {
      engineState.llmFailures++;
      // LLM failed — events keep their fallback text (already assigned in newsBuilder)
    }
  } catch (error) {
    console.warn('[NewsLLM] flushBatch error:', error);
    engineState.llmFailures++;
  } finally {
    isFlushing = false;

    // If more events accumulated while we were flushing, schedule another flush
    if (pendingBatch.length >= BATCH_MIN_SIZE) {
      setTimeout(() => flushBatch(), 2000); // 2s delay to let more events accumulate
    }
  }
}

// ─── Apply LLM headlines to store ────────────────────────────────────────────

function applyHeadlinesToStore(
  headlines: BatchHeadline[],
  batchEvents: PendingEvent[],
): void {
  if (!updateCallback) return;

  const updates: Array<{
    id: string;
    title: string;
    description: string;
    affectedResources?: string[];
    textSource: 'llm';
  }> = [];

  // Match headlines to events
  // Strategy: For each headline, find the best-matching event(s) by affectedResources
  const usedEventIds = new Set<string>();

  for (const headline of headlines) {
    // Find events whose resource appears in the headline's affectedResources
    const matchingEvents = batchEvents.filter(
      e => headline.affectedResources.includes(e.packet.resource) && !usedEventIds.has(e.newsId)
    );

    if (matchingEvents.length > 0) {
      // Use the first matching event's ID as the primary update target
      const primary = matchingEvents[0];
      usedEventIds.add(primary.newsId);

      updates.push({
        id: primary.newsId,
        title: headline.title,
        description: headline.description,
        affectedResources: headline.affectedResources,
        textSource: 'llm',
      });

      // If multiple events are grouped into one headline, mark the rest as consolidated
      // (they don't get separate updates — the headline covers them)
      for (let i = 1; i < matchingEvents.length; i++) {
        usedEventIds.add(matchingEvents[i].newsId);
      }
    } else {
      // No resource match — assign to the first unassigned event
      const unassigned = batchEvents.find(e => !usedEventIds.has(e.newsId));
      if (unassigned) {
        usedEventIds.add(unassigned.newsId);
        updates.push({
          id: unassigned.newsId,
          title: headline.title,
          description: headline.description,
          affectedResources: headline.affectedResources,
          textSource: 'llm',
        });
      }
    }
  }

  if (updates.length > 0) {
    updateCallback(updates);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the LLM news system.
 * Marks as ready — the actual API will be tested on first call.
 */
export async function initNewsLLM(): Promise<void> {
  if (engineState.loadState !== 'idle') return;

  // Only initialize in browser environment
  if (typeof window === 'undefined') {
    engineState.loadState = 'unsupported';
    return;
  }

  engineState.loadState = 'ready';
  engineState.model = 'cloudflare-llama-3.1-8b';
  engineState.backend = 'cloudflare';
}

/**
 * Register a callback that will be called when LLM results arrive.
 * The callback receives an array of updates to apply to the store.
 */
export function registerUpdateCallback(callback: NewsUpdateCallback): void {
  updateCallback = callback;
}

/**
 * Add an event to the batch buffer for LLM processing.
 * The event's fallback text is already assigned in the MarketNews object.
 * When the LLM batch completes, the callback will update the store.
 *
 * @param packet - The EventPacket from the news event
 * @param newsId - The MarketNews ID to update when LLM result arrives
 */
export function addEventToBatch(packet: EventPacket, newsId: string): void {
  if (engineState.loadState !== 'ready') return;
  if (Date.now() < disabledUntil) return;

  // Add to pending batch
  pendingBatch.push({ packet, newsId });
  engineState.pendingBatchSize = pendingBatch.length;

  // Check if we should flush immediately
  const hasHighSeverity = packet.severity === 'high';
  const batchFull = pendingBatch.length >= BATCH_MAX_SIZE;
  const batchReady = pendingBatch.length >= BATCH_MIN_SIZE;

  if (batchFull || (hasHighSeverity && batchReady)) {
    // Flush immediately — enough events or high severity event
    scheduleFlush(0);
  } else if (batchReady && !flushTimer) {
    // Start the timer — will flush after interval unless more events arrive
    scheduleFlush(BATCH_FLUSH_INTERVAL_MS);
  } else if (!flushTimer) {
    // Even a single event gets a timer — it will flush after the interval
    scheduleFlush(BATCH_FLUSH_INTERVAL_MS);
  }
}

/**
 * Schedule a batch flush after the given delay.
 * If a flush is already scheduled, it won't reschedule (unless delay=0 for immediate).
 */
function scheduleFlush(delayMs: number): void {
  if (delayMs === 0) {
    // Immediate flush — clear any existing timer
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushBatch();
  } else if (!flushTimer) {
    // Schedule a delayed flush
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBatch();
    }, delayMs);
  }
}

/**
 * Reset the 24-hour budget counter.
 * Called when a new game day starts.
 */
export function resetDailyBudget(): void {
  engineState.callsThisGameDay = 0;
}

/**
 * Update the current game day for budget tracking.
 * If the day changed, reset the budget.
 */
export function updateGameDay(gameDay: number): void {
  if (gameDay !== lastGameDay) {
    lastGameDay = gameDay;
    engineState.callsThisGameDay = 0;
  }
}

/**
 * Return current engine state for UI display.
 */
export function getLLMState(): LLMEngineState {
  return { ...engineState };
}

/**
 * Clean up resources held by the LLM engine.
 */
export function shutdownNewsLLM(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pendingBatch = [];
  isFlushing = false;
  newsCache.clear();
  genTimeSamples = [];
  disabledUntil = 0;
  recentHeadlines.length = 0;
  updateCallback = null;
  lastGameDay = -1;

  engineState = {
    loadState: 'idle',
    model: null,
    backend: null,
    averageGenTimeMs: 0,
    totalCalls: 0,
    totalEventsProcessed: 0,
    cacheHits: 0,
    llmSuccesses: 0,
    llmFailures: 0,
    callsThisGameDay: 0,
    lastCallTimestamp: 0,
    pendingBatchSize: 0,
  };
}
