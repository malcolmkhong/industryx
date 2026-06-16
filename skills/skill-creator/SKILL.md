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
