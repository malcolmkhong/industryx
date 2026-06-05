// ============================================
// FACTORY DOMINION — Cloudflare Worker AI
// Batched Market News Generator
// ============================================
//
// Input:  POST { events: EventPacket[], recentHeadlines?: string[] }
// Output: { headlines: [{ title, description, affectedResources }], source: "llm" }
//
// The game sends BATCHES of 3-8 market events.
// This worker groups related events and generates 1-5 headlines per batch.
// ============================================

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: "Use POST" },
        { status: 405, headers: corsHeaders() }
      );
    }

    try {
      const body = await request.json();
      const events = body.events;
      const recentHeadlines = body.recentHeadlines || [];

      // ── Validate input ──────────────────────────────────────
      if (!Array.isArray(events) || events.length === 0) {
        return Response.json(
          { error: "No events provided. Send { events: [...] }" },
          { status: 400, headers: corsHeaders() }
        );
      }

      if (events.length > 8) {
        return Response.json(
          { error: "Max 8 events per batch" },
          { status: 400, headers: corsHeaders() }
        );
      }

      for (const evt of events) {
        if (!evt.type || !evt.resource) {
          return Response.json(
            { error: `Invalid EventPacket: missing type or resource in ${JSON.stringify(evt)}` },
            { status: 400, headers: corsHeaders() }
          );
        }
      }

      // ── Build the prompt for the LLM ──────────────────────

      const eventSummaries = events.map((evt, i) => {
        const parts = [];
        parts.push(`[${i + 1}] Resource: ${evt.resource}`);
        parts.push(`    Event: ${evt.type}`);
        parts.push(`    Change: ${evt.delta || "N/A"}`);
        parts.push(`    Severity: ${evt.severity || "low"}`);
        if (evt.context?.cause) parts.push(`    Cause: ${evt.context.cause}`);
        if (evt.context?.sectorName) parts.push(`    Sector: ${evt.context.sectorName}`);
        if (evt.context?.source) parts.push(`    Source: ${evt.context.source}`);
        if (evt.context?.volume) parts.push(`    Volume: ${evt.context.volume}`);
        if (evt.context?.trend) parts.push(`    Trend: ${evt.context.trend}`);
        if (evt.context?.oldPrice !== undefined) parts.push(`    Old price: $${evt.context.oldPrice.toFixed(2)}`);
        if (evt.context?.newPrice !== undefined) parts.push(`    New price: $${evt.context.newPrice.toFixed(2)}`);
        return parts.join("\n");
      });

      const recentStr = recentHeadlines.length > 0
        ? `\nRecent headlines (avoid repeating these):\n${recentHeadlines.map(h => `- "${h}"`).join("\n")}`
        : "";

      const systemPrompt = `You are a financial news writer for a market simulation game called Factory Dominion. You receive BATCHES of market events and write 1-5 grouped news headlines.

STRICT RULES:
1. GROUP related events (same sector, same cause, same resource) into ONE headline when possible
2. Each headline must have: title (3-8 words, catchy), description (1-5 sentences), affectedResources (array of resource names)
3. Do NOT invent new data or numbers — only use the exact values provided
4. Do NOT change any percentages, prices, or delta values
5. Do NOT change resource names — use the EXACT resource names given
6. Do NOT add fake causes or events not mentioned in the input
7. Only rewrite the information into natural, varied, professional news text
8. Output MUST be valid JSON: {"headlines": [{"title": "...", "description": "...", "affectedResources": ["resource1", "resource2"]}]}
9. Do NOT add any text before or after the JSON
10. Do NOT wrap JSON in code blocks
11. Vary vocabulary — use different verbs, nouns, and sentence structures each time
12. If there are ${events.length} events, generate 1-${Math.min(events.length, 5)} headlines (fewer if events are related)
13. Every event's resource MUST appear in at least one headline's affectedResources array`;

      const userPrompt = `Generate ${Math.min(events.length, 5)} grouped market news headlines for these ${events.length} events. Combine related events into single headlines.\n\n${eventSummaries.join("\n\n")}${recentStr}`;

      // ── Call Llama 3.1 Instruct via Workers AI ────────────

      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
      });

      const rawText = result.response || "";

      // ── Parse the LLM JSON output ─────────────────────────

      let parsed = null;
      try {
        let jsonStr = rawText.trim();
        // Extract JSON from markdown code block if present
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
        // Find JSON object in text
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        parsed = JSON.parse(jsonStr);
      } catch {
        parsed = null;
      }

      // ── Validate and return headlines ──────────────────────

      if (parsed && Array.isArray(parsed.headlines) && parsed.headlines.length > 0) {
        const validatedHeadlines = parsed.headlines
          .filter(h => h.title && h.description)
          .map(h => ({
            title: String(h.title).slice(0, 100),
            description: String(h.description).slice(0, 300),
            affectedResources: Array.isArray(h.affectedResources)
              ? h.affectedResources.map(String)
              : [events[0]?.resource || "unknown"],
          }));

        if (validatedHeadlines.length > 0) {
          return Response.json(
            { headlines: validatedHeadlines, source: "llm" },
            { headers: corsHeaders() }
          );
        }
      }

      // Fallback: try to extract a single headline from raw text
      if (rawText.length > 10) {
        const fallbackHeadlines = events.slice(0, 3).map(evt => ({
          title: `${evt.resource} Market Update`,
          description: rawText.slice(0, 300),
          affectedResources: [evt.resource],
        }));

        return Response.json(
          { headlines: fallbackHeadlines, source: "llm" },
          { headers: corsHeaders() }
        );
      }

      return Response.json(
        { error: "Empty LLM response", source: "fallback" },
        { status: 500, headers: corsHeaders() }
      );

    } catch (err) {
      return Response.json(
        {
          error: "AI failure",
          details: String(err?.message || err),
          source: "fallback",
        },
        { status: 500, headers: corsHeaders() }
      );
    }
  },
};

// ── CORS Headers ──────────────────────────────────────────────

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
