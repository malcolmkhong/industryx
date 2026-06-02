/**
 * News LLM API Route — Server-side LLM text generation for market news.
 *
 * Uses z-ai-web-dev-sdk (server-side only) to rewrite EventPacket data
 * into natural, varied financial news text.
 *
 * Key constraints:
 * - LLM is ONLY a language layer — it rewrites text, does NOT change meaning or data
 * - Strict prompt ensures no fabricated data, no changed values, no fake causes
 * - Returns JSON: { title, description } or falls back gracefully
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

// ─── LLM System Prompt ──────────────────────────────────────────────────────────

const NEWS_SYSTEM_PROMPT = `You are a financial news writer for a market simulation game called Factory Dominion. Write concise, professional market news articles.

STRICT RULES — YOU MUST FOLLOW ALL OF THESE:
1. Do NOT invent new data or numbers — only use the exact values provided
2. Do NOT change any percentages, prices, or delta values
3. Do NOT change resource names — use the exact resource name given
4. Do NOT add fake causes or events not mentioned in the input
5. Only rewrite the information into natural, varied, professional news text
6. Keep meaning IDENTICAL to the input — just make it read like real financial news
7. Output MUST be 1-5 sentences for description
8. Title must be short (3-8 words) and catchy
9. Output MUST be valid JSON with this exact format: {"title": "...", "description": "..."}
10. Do NOT add any text before or after the JSON
11. Do NOT wrap the JSON in code blocks
12. Vary your vocabulary — use different verbs, nouns, and sentence structures each time`;

// ─── Lazy ZAI Instance ──────────────────────────────────────────────────────────

let zaiInstance: unknown = null;
let initPromise: Promise<unknown> | null = null;

async function getZAI(): Promise<unknown> {
  if (zaiInstance) return zaiInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      zaiInstance = await ZAI.create();
      return zaiInstance;
    } catch (error) {
      console.error('[NewsLLM API] Failed to initialize z-ai-web-dev-sdk:', error);
      initPromise = null; // Allow retry
      throw error;
    }
  })();

  return initPromise;
}

// ─── POST Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packet } = body as { packet: EventPacket };

    if (!packet || !packet.type || !packet.resource) {
      return NextResponse.json(
        { error: 'Invalid EventPacket: missing required fields' },
        { status: 400 }
      );
    }

    // Build the user prompt from the EventPacket
    const userPrompt = buildUserPrompt(packet);

    // Get ZAI instance (lazy init)
    const zai = await getZAI() as {
      chat: {
        completions: {
          create: (params: {
            messages: Array<{ role: string; content: string }>;
            thinking: { type: string };
          }) => Promise<{
            choices: Array<{ message: { content: string } }>;
          }>;
        };
      };
    };

    // Call LLM with retry for rate limiting (429)
    let llmResponse = '';
    const MAX_RETRIES = 2;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'assistant', content: NEWS_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          thinking: { type: 'disabled' },
        });
        llmResponse = completion.choices?.[0]?.message?.content ?? '';
        lastError = null;
        break; // success
      } catch (error) {
        lastError = error;
        const errorMsg = String(error);
        // Only retry on rate limit errors
        if (!errorMsg.includes('429') && !errorMsg.includes('Too many requests')) {
          break; // non-retryable error
        }
        console.warn(`[NewsLLM API] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying...`);
      }
    }

    if (lastError) {
      console.warn('[NewsLLM API] LLM call failed after retries:', lastError);
      return NextResponse.json(
        { error: 'LLM generation failed', source: 'fallback' },
        { status: 500 }
      );
    }

    if (!llmResponse || llmResponse.trim().length === 0) {
      return NextResponse.json(
        { error: 'Empty LLM response', source: 'fallback' },
        { status: 500 }
      );
    }

    // Parse the JSON output from the LLM
    const parsed = parseLLMOutput(llmResponse, packet);

    if (!parsed) {
      console.warn('[NewsLLM API] Failed to parse LLM output:', llmResponse.slice(0, 200));
      return NextResponse.json(
        { error: 'Invalid LLM output format', source: 'fallback' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      title: parsed.title,
      description: parsed.description,
      source: 'llm',
    });
  } catch (error) {
    console.error('[NewsLLM API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', source: 'fallback' },
      { status: 500 }
    );
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────────

function buildUserPrompt(packet: EventPacket): string {
  const details: string[] = [];

  details.push(`Event type: ${packet.type}`);
  details.push(`Resource: ${packet.resource}`);
  details.push(`Price change: ${packet.delta}`);
  details.push(`Severity: ${packet.severity}`);

  if (packet.context.cause) details.push(`Cause: ${packet.context.cause}`);
  if (packet.context.sectorName) details.push(`Sector: ${packet.context.sectorName}`);
  if (packet.context.source) details.push(`Source: ${packet.context.source}`);
  if (packet.context.volume) details.push(`Volume: ${packet.context.volume}`);
  if (packet.context.trend) details.push(`Trend: ${packet.context.trend}`);
  if (packet.context.oldPrice !== undefined) details.push(`Old price: $${packet.context.oldPrice.toFixed(2)}`);
  if (packet.context.newPrice !== undefined) details.push(`New price: $${packet.context.newPrice.toFixed(2)}`);
  if (packet.context.basePrice !== undefined) details.push(`Base price: $${packet.context.basePrice.toFixed(2)}`);

  return `Rewrite this market event into a professional news headline and brief article. Use the EXACT values provided — do not change numbers or invent information.\n\n${details.join('\n')}`;
}

function parseLLMOutput(
  text: string,
  packet: EventPacket,
): { title: string; description: string } | null {
  try {
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
      // Validate title length
      const titleWords = parsed.title.split(/\s+/).length;
      if (titleWords < 2) {
        return {
          title: `${packet.resource} Market Update`,
          description: parsed.description.slice(0, 300),
        };
      }

      // Ensure resource is mentioned somewhere in title or description
      const resourceMentioned =
        parsed.title.toLowerCase().includes(packet.resource.toLowerCase()) ||
        parsed.description.toLowerCase().includes(packet.resource.toLowerCase());

      if (!resourceMentioned) {
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
