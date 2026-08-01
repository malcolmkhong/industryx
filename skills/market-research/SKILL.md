---
name: market-research
description: Conduct market research, competitive analysis, investor due diligence, and industry intelligence with source attribution and decision-oriented summaries. Use when the user wants market sizing, competitor comparisons, fund research, technology scans, or research that informs business decisions.
origin: ECC
---

# Market Research

Produce research that supports decisions, not research theater.

## When to Activate

- researching a market, category, company, investor, or technology trend
- building TAM/SAM/SOM estimates
- comparing competitors or adjacent products
- preparing investor dossiers before outreach
- pressure-testing a thesis before building, funding, or entering a market

## Research Standards

1. Every important claim needs a source.
2. Prefer recent data and call out stale data.
3. Include contrarian evidence and downside cases.
4. Translate findings into a decision, not just a summary.
5. Separate fact, inference, and recommendation clearly.

## Coverage Patterns

### Avoid Western-Only Sources
Initial web searches skew toward US-centric outlets (Anthropic, OpenAI, Google coverage). For an AI model market scan, always include the second sweep covering:
- **China** — Alibaba/Qwen, DeepSeek, Zhipu (GLM), Moonshot (Kimi), Xiaomi (MiMo), MiniMax, Tencent Hunyuan, Baichuan
- **Open-weight** — Hugging Face downloads, GGUF availability, local-host viability
- **Less-covered Western vendors** — Mistral, Cohere, xAI/Grok, Reka, Inflection

The pattern: do the first pass with broad keywords, then a targeted second pass with `site:reddit.com OR site:huggingface.co China AI model 2026` or similar. If the user names a specific company and it isn't covered (e.g. "why don't I see MiniMax?"), that's a direct signal to add a focused search before declaring the report complete.

### Always Include the Company Website
For each vendor, capture the **canonical website URL** (not just press links) so the user can drill in. For Chinese vendors, prefer the international site where one exists; otherwise the domestic site with a note.

## Common Research Modes

### Investor / Fund Diligence
Collect:
- fund size, stage, and typical check size
- relevant portfolio companies
- public thesis and recent activity
- reasons the fund is or is not a fit
- any obvious red flags or mismatches

### Competitive Analysis
Collect:
- product reality, not marketing copy
- funding and investor history if public
- traction metrics if public
- distribution and pricing clues
- strengths, weaknesses, and positioning gaps

### Market Sizing
Use:
- top-down estimates from reports or public datasets
- bottom-up sanity checks from realistic customer acquisition assumptions
- explicit assumptions for every leap in logic

### Technology / Vendor Research
Collect:
- how it works
- trade-offs and adoption signals
- integration complexity
- lock-in, security, compliance, and operational risk

## Output Format

Default structure:
1. executive summary
2. key findings
3. implications
4. risks and caveats
5. recommendation
6. sources

## Quality Gate

Before delivering:
- all numbers are sourced or labeled as estimates
- old data is flagged
- the recommendation follows from the evidence
- risks and counterarguments are included
- the output makes a decision easier

## Pitfalls — Common Research-Process Mistakes

### 1. Coverage completeness — search exhaustively, not exhaustedly
When asked to compare models, vendors, or categories in a market:
- Do **not** stop at the first 5–10 sources
- Do **not** bias the report to the user's locale or your training-data priors
- Actively search for: regional players (China, EU, etc.), open-source / local options, niche entrants — not just the obvious Western leaders
- If the user says "why no China models" or "what about X" after you delivered, that's a coverage failure. Their pushback is a signal you stopped too early
- The right pattern: when the report is about a global category, include at least 3 regions (typically US, Europe, China + open-source/local). Same applies to vertical markets (B2B, gaming, finance, etc.)

### 2. Source attribution
- Every important claim needs a source URL or a labeled estimate
- The final "Sources" section should be at least 3–5 reputable sources for non-trivial claims
- If a number cannot be sourced, label it as an estimate or call it out as "reported but unverified"

### 3. Update the report, don't just acknowledge the gap
If the user points out a missing section, patch the saved report file directly, then summarize what you added. Don't just say "good point" — actually update the artifact so the next session starts with the complete version.
