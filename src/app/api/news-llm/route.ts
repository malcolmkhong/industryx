/**
 * News LLM API Route — Proxy to Cloudflare Workers AI
 *
 * Proxies batched EventPacket requests from the browser to the
 * Cloudflare Worker AI endpoint for news generation.
 *
 * Why a proxy instead of calling Cloudflare directly from the browser?
 * - Server-side rate limiting (prevent abuse)
 * - Cloudflare Worker URL is not exposed to the client
 * - Can add logging, metrics, and circuit breaking
 * - Future-proof: can swap backends without client changes
 *
 * Input:  POST { events: EventPacket[], recentHeadlines?: string[] }
 * Output: { headlines: [{ title, description, affectedResources }], source: "llm" }
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface EventPacket {
  type: 'price_move' | 'volatility' | 'sector' | 'trade';
  resource: string;
  delta: string;
  severity: 'low' | 'medium' | 'high';
  context: {
    cause?: string;
    region?: string;
    sectorName?: string;
    source?: string;
    volume?: number;
    trend?: string;
    oldPrice?: number;
    newPrice?: number;
    basePrice?: number;
  };
}

// ─── Configuration ──────────────────────────────────────────────────────────────

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || 'https://newsgenerator.malcolmkhong.workers.dev';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_EVENTS_PER_BATCH = 8;

// ─── Server-side Rate Limiting ──────────────────────────────────────────────────

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 5_000; // Max 1 request per 5 seconds server-side

// ─── POST Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { events, recentHeadlines } = body as {
      events?: EventPacket[];
      recentHeadlines?: string[];
    };

    // Validate input
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'No events provided. Send { events: [...] }' },
        { status: 400 }
      );
    }

    if (events.length > MAX_EVENTS_PER_BATCH) {
      return NextResponse.json(
        { error: `Max ${MAX_EVENTS_PER_BATCH} events per batch` },
        { status: 400 }
      );
    }

    // Validate each event has required fields
    for (const event of events) {
      if (!event.type || !event.resource) {
        return NextResponse.json(
          { error: 'Invalid EventPacket: missing type or resource' },
          { status: 400 }
        );
      }
    }

    // Server-side rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      // Rate limited — tell client to retry after the cooldown
      const retryAfterMs = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest + 500; // +500ms buffer
      return NextResponse.json(
        {
          error: 'Rate limited',
          retryAfterMs,
          source: 'fallback',
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    // Forward to Cloudflare Worker
    const workerResponse = await fetch(CLOUDFLARE_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, recentHeadlines }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!workerResponse.ok) {
      // Rate-limit server-side warnings — max once per 60 seconds
      const now = Date.now();
      if (now - lastRequestTime > 60_000 || workerResponse.status !== 502) {
        const errorText = await workerResponse.text().catch(() => 'Unknown error');
        console.warn(`[NewsLLM Proxy] Worker returned ${workerResponse.status}: ${errorText}`);
      }
      return NextResponse.json(
        { error: 'Worker AI failed', source: 'fallback' },
        { status: 502 }
      );
    }

    const workerData = await workerResponse.json();

    // Validate worker response has headlines
    if (!workerData.headlines || !Array.isArray(workerData.headlines) || workerData.headlines.length === 0) {
      return NextResponse.json(
        { error: 'No headlines generated', source: 'fallback' },
        { status: 502 }
      );
    }

    // Forward the worker's response to the client
    return NextResponse.json({
      headlines: workerData.headlines,
      source: 'llm',
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it was a timeout
    if (errorMessage.includes('abort') || errorMessage.includes('timeout')) {
      // Rate-limit timeout warnings
      const now = Date.now();
      if (now - lastRequestTime > 60_000) {
        console.warn('[NewsLLM Proxy] Request to Cloudflare Worker timed out');
      }
      return NextResponse.json(
        { error: 'Worker AI timeout', source: 'fallback' },
        { status: 504 }
      );
    }

    console.error('[NewsLLM Proxy] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', source: 'fallback' },
      { status: 500 }
    );
  }
}
