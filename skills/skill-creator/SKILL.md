---
name: skill-creator
description: Create, upgrade, and optimize Hermes skills. Use when the user wants to create a skill from scratch, edit an existing skill, benchmark performance, optimize triggering, or package a skill for distribution.
version: 2.0.0
---

# Skill Creator v2

A modern workflow for creating, upgrading, and optimizing Hermes-compatible skills.

## How Skills Work

Skills are reusable packages of instructions, metadata, and optional resources. They load on demand so your context stays lean.

**Three-tier progressive loading:**
1. **Metadata** — `name` + `description` (~100 words). Always loaded. This is the trigger.
2. **Instructions** — `SKILL.md` body (<500 lines). Loaded only when the skill triggers.
3. **Resources** — scripts, references, assets. Executed or read only when referenced.

**Skill anatomy:**
```
skill-name/
├── SKILL.md          # Required: frontmatter + instructions
├── scripts/          # Optional: executable code for deterministic tasks
├── references/       # Optional: docs loaded as needed
└── assets/           # Optional: templates, icons, sample files
```

## The Workflow

### 1. Capture Intent

Understand what the user needs:
- What should this skill do?
- When should it trigger? (intent, keywords, context)
- What's the expected output?
- Does it need tests? Objective outputs benefit from evals; subjective ones usually don't.

**Trigger design rule:** Make descriptions specific. Include both *what it does* and *when to use it*. Hermes undertriggers skills by default — compensate by being explicit in the description.

### 2. Write or Update the SKILL.md

**Frontmatter (required):**
```yaml
---
name: skill-identifier
description: What it does and when to use it. Include trigger phrases and use cases.
version: 2.0.0
---
```

**Body (required):**
- Use **imperative form**: "Do X," "Run Y," "Validate Z."
- Explain the **why**, not just the what. LLMs reason better with context.
- Keep under 500 lines; if longer, split into `references/` files and point to them.
- For multi-domain skills, organize by variant under `references/`.

**Example:**
```markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

### 3. Compose Skills

Modern workflows chain skills. In cron jobs or complex tasks, load multiple skills to compose capabilities:
- PDF + charts + market research → professional daily report
- web-reader + writing-plans → structured research brief

When updating a cron or task, list all skills in `skills: []`.

### 4. Test & Iterate (Optional)

For skills with verifiable outputs, create 2–3 realistic test prompts and evaluate.

**Quick test pattern:**
- Draft 3 test prompts reflecting real usage
- Run them with the skill loaded
- Review outputs for correctness and style
- Patch the skill based on gaps
- Repeat 2–3 times max for simple skills

### 5. Optimize Description

After the skill works, improve triggering:
1. Generate 20 realistic queries (8–10 must-trigger, 8–10 must-not-trigger)
2. Review edge cases with the user
3. Test trigger rates and refine the description wording
4. Apply the best description back to `SKILL.md`

## Hermes-Specific Operations

- **Create skills with** `skill_manage(action='create', name='category/skill-name', content='...')`
- **Patch skills with** `skill_manage(action='patch', name='category/skill-name', old_string='...', new_string='...')`
- **View skills with** `skill_view(name='category/skill-name')`
- **Attach to cron jobs** via the `skills` array in `cronjob(action='update', ...)`
- **Attach to subagents** via `toolsets` in `delegate_task`

## Writing Style

- Prefer **"do X because Y"** over **"MUST do X"**
- Use concrete examples over abstract rules
- Keep instructions general enough for reuse, specific enough to be useful
- If a paragraph doesn't change behavior, cut it

### Anti-AI-tone rules (applies to skill output text)

When writing skill bodies, READMEs, report copy, or example prose for a user who has signaled they want human voice:

- **No em dashes** (`—`). Use a period, comma, or restructure the sentence.
- **No "AI tone" markers**: avoid `comprehensive`, `leverage`, `robust`, `seamless`, `elevate`, `cutting-edge`, `game-changing`, `holistic`, `synergy`, `innovative`. Use specific concrete words instead.
- **No "it is not X, it is Y" rhetorical pivots** when a direct statement works.
- **Short sentences over long ones** when both are possible.
- **Concrete over abstract.** "Runs in 0.4s" beats "performs efficiently."
- If the user corrects style once, encode it in the skill body so the next session does not repeat the mistake.

### Research-first rule (decisions about market, tool, or product direction)

Before recommending a direction, product, niche, or "where to compete" answer:

- **Do a real web search first.** Do not rely on assumed knowledge of the competitive landscape.
- **Look for current signals:** existing repos, marketplaces, leaderboards, recent (last 90 days) articles, recent launches.
- **Surface saturated markets** with names of incumbents, then identify the actual gap.
- **Then** propose 2-3 directions with reasoning.
- Do not just pick a direction from memory. The user will catch it. They are paying attention to whether you checked.

This rule exists because I once jumped to "lets build an AI skill marketplace" without checking, and the user stopped me: "this market is very competitive now, why you pick this track? you should do research first."

## Pitfalls — Common Skill-Creation Mistakes

### 1. Never write secrets blind into config files
When the user pastes tokens (GitHub PAT, Supabase key, etc.) for a config write:
- Do **not** echo the token back into the file via string concatenation without verifying
- Do **not** write a `~/.hermes/config.yaml` line with a literal token unless you can read the file back and confirm the exact token is in there
- If `write_file` returns success but you haven't read the file back, **stop and verify** — the tool may have written a placeholder
- The right pattern: write the line with the real token, then immediately `read_file` the file to confirm, then tell the user it's safe

### 2. Do not retry the same failed write hoping it'll work
If `write_file` returns success but the file content is wrong, **stop and inspect**:
- `read_file` the file to see what actually landed
- Tell the user what happened honestly (placeholder, truncation, encoding issue)
- Have the user verify or paste the real value, then write once more
- Two failed blind retries in a row = stop and switch to "guide the user to edit manually"

### 3. Skill name collisions
When `skill_view(name='X')` returns `Ambiguous skill name 'X': 2 skills match`, this is a real friction point. The two skills are reachable by the same name through different paths. The fix is **one of**:
- Rename the duplicate to a more specific name (e.g. `market-research-v2`)
- Delete the duplicate after confirming the canonical one has the right content
- Surface the conflict in your reply, not just the error

This commonly happens when installing a skill from GitHub into a path that overlaps an existing skill in the `industryx/` junction.

### 4. Verify before claiming success
- Do **not** say "done" after a single `write_file` call
- **Do** `read_file` the file afterward to confirm the actual content matches the intended content
- This is especially important for: config files (cron jobs, MCP servers, hermes config), skill files (SKILL.md), report outputs, anything with secrets, tokens, or generated code

### 5. User language preference
When the user switches to a non-English language mid-conversation (e.g. Chinese), the rest of your replies should match that language for the remainder of that turn. Skills themselves stay in English (the user reads them in English when reviewing), but conversational output follows the user's lead. The same goes for the user responding in any other natural language.
