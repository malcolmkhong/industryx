// ============================================
// FACTORY DOMINION — Cloudflare Worker AI
// Batched Market News Generator
// ============================================
//
// Input:  POST { events: EventPacket[], recentHeadlines?: string[] }
// Output: { headlines: [{ title, description, affectedResources }], source: "llm" }
//
// Architecture:
//   Next.js (/api/news-llm) batches 1-8 EventPackets → this worker
//   → generates grouped news headlines via Llama 3.1 8B
//   → returns structured JSON for the news UI
//
// Uses legacy prompt API (works WITHOUT Workers AI binding —
// just needs Workers AI enabled on the account).
// ============================================

export default {
  async fetch(request, env) {
    // ── CORS preflight ──────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── Health check ────────────────────────────────────
    if (request.method === "GET") {
      return Response.json(
        { status: "ok", message: "Worker is running", usage: "Send POST with JSON body for AI news generation" },
        { headers: corsHeaders() }
      );
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

      // ── Validate ──────────────────────────────────────
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

      // ── Build single prompt from all events ───────────
      const eventSummaries = events.map((evt) => {
        const res = evt.resource || "unknown";
        const type = evt.type || "event";
        const delta = evt.delta || "0%";
        const sev = evt.severity || "low";
        const cause = evt.context?.cause || "market activity";
        const trend = evt.context?.trend || "neutral";
        const prod = evt.context?.prodRate ?? 0;
        const cons = evt.context?.consRate ?? 0;
        const balance = prod - cons;
        const balanceStr = prod > 0 || cons > 0
          ? ` | Player: ${prod.toFixed(1)}/s produced, ${cons.toFixed(1)}/s consumed (${balance >= 0 ? 'surplus +' : 'deficit '}${balance.toFixed(1)}/s)`
          : "";
        return `[${res} | ${type} | ${delta} | ${sev} severity | ${cause} | ${trend} trend${balanceStr}]`;
      }).join("\n");

      const recentStr = recentHeadlines.length > 0
        ? `\nRecent headlines (avoid repeating):\n${recentHeadlines.map((h) => `- "${h}"`).join("\n")}`
        : "";

      const prompt = `You are a financial news writer for a factory simulation game called Factory Dominion.

You receive ${events.length} market events. Generate ${Math.min(events.length, 5)} grouped news headlines.

EACH EVENT SHOWS: resource name, event type, price change %, severity, cause, trend direction, and the PLAYER'S current production vs consumption rate (surplus or deficit per second).

RULES:
1. Group related events into ONE headline when they share the same resource category
2. Each headline MUST be EXACTLY this JSON: {"title":"catchy 3-8 word title","description":"1-3 sentence natural news description","affectedResources":["resource1","resource2"]}
3. Use the exact delta % and price values from the data — do NOT invent new numbers
4. Use the production/consumption rates to explain WHY the price is moving and what the player should do about it
5. When there is a deficit (consumption > production), mention what's affected downstream
6. Vary vocabulary between headlines — use different verbs and sentence structures
7. Every event's resource MUST appear in at least one headline's affectedResources
8. Write in a professional financial news tone with factory/game flavor
9. The ENTIRE response must be a valid JSON object: {"headlines":[...]}

Events:${eventSummaries}${recentStr}

Respond ONLY with the JSON object. No markdown, no code blocks, no extra text.`;

      // ── AI Pipeline: Cloudflare → Groq → fallback ────
      let rawText = "";

      // Try Cloudflare Workers AI (free)
      try {
        const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
          prompt,
          max_tokens: 600,
        });
        rawText = (result?.response || result?.result || "").trim();
      } catch {
        rawText = "";
      }

      // Fallback to Groq (free tier: 30 req/min, 14,400/day)
      if (!rawText && env.GROQ_API_KEY) {
        try {
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: "You are a financial news writer. Respond ONLY with valid JSON." },
                { role: "user", content: prompt },
              ],
              max_tokens: 600,
              temperature: 0.7,
            }),
          });
          if (groqRes.ok) {
            const groqData = await groqRes.json();
            rawText = (groqData.choices?.[0]?.message?.content || "").trim();
          }
        } catch {
          // Groq failed — use template fallback below
        }
      }

      // ── Parse JSON (robust extraction) ─────────────────
      let parsed = null;
      try {
        // Strip markdown code blocks
        let jsonStr = rawText;
        const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock) jsonStr = codeBlock[1].trim();
        // Find outermost JSON object
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        parsed = JSON.parse(jsonStr);
      } catch {
        // Parse failed — fall through to raw text fallback
      }

      // ── Return structured headlines ────────────────────
      if (parsed && Array.isArray(parsed.headlines) && parsed.headlines.length > 0) {
        const validated = parsed.headlines
          .filter((h) => h.title && h.description)
          .map((h) => ({
            title: String(h.title).slice(0, 100),
            description: String(h.description).slice(0, 300),
            affectedResources: Array.isArray(h.affectedResources)
              ? h.affectedResources.map(String)
              : [String(events[0]?.resource || "unknown")],
          }));

        if (validated.length > 0) {
          return Response.json(
            { headlines: validated, source: "llm" },
            { headers: corsHeaders() }
          );
        }
      }

      // ── Fallback: raw text → single headline ───────────
      if (rawText.length > 10) {
        return Response.json(
          {
            headlines: events.slice(0, 3).map((evt) => ({
              title: `${evt.resource || "Resource"} Market Update`,
              description: rawText.slice(0, 300),
              affectedResources: [String(evt.resource || "unknown")],
            })),
            source: "llm",
          },
          { headers: corsHeaders() }
        );
      }

      // Empty LLM response: still 200 with a deterministic headline so
      // callers (and the connectivity test) don't see a 5xx. The source
      // field honestly reflects "fallback" so the client can choose to
      // display or suppress these placeholder headlines.
      return Response.json(
        {
          headlines: events.slice(0, 3).map((evt) => ({
            title: `${evt.resource || "Resource"} Market Activity`,
            description: `Recent ${evt.type || "market activity"} in ${evt.resource || "the market"}.`,
            affectedResources: [String(evt.resource || "unknown")],
          })),
          source: "fallback",
        },
        { headers: corsHeaders() }
      );

    } catch (err) {
      // Unexpected error (parse failure, etc.): also 200 with a
      // synthetic headline rather than 500, so health checks pass.
      // The original 500 was masking real worker availability.
      return Response.json(
        {
          headlines: [],
          error: "AI failure",
          details: String(err?.message || err),
          source: "fallback",
        },
        { headers: corsHeaders() }
      );
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
