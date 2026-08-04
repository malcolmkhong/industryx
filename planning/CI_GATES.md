# CI Gates — Prevent Design-System Regressions

> **Purpose:** Block new raw color and arbitrary-value regressions in the design system. Wired into CI.
> **Created:** 2026-06-17 (Phase 2.6 of UI_UX_REMEDIATION_PLAN)
> **Source:** Phase 2 of `planning/UI_UX_REMEDIATION_PLAN.md`

---

## What is blocked

The following patterns are **banned** in `src/**` for new code. CI will fail if they appear in any PR diff.

### 1. Raw hex colors in `bg-` or `text-` utilities

```sh
# Block: new raw hex background/text colors
git diff origin/main -- src/ | grep -E '^\+.*(bg|text)-\[#[0-9a-fA-F]' && echo "FAIL: raw hex color introduced" && exit 1
```

**Use instead:** semantic tokens (`bg-background`, `text-warning`, `border-success`, etc.).

### 2. Raw Tailwind palette colors for status / semantic meanings

The following palette classes may NOT be introduced for new code:

```sh
# Block: raw palette classes for status / semantic meaning
git diff origin/main -- src/ | grep -E '^\+.*(bg|text|border|ring)-(red|emerald|amber|yellow|fuchsia|violet|orange|pink|rose|indigo|sky|teal|cyan|blue|purple|lime|green)-[0-9]+' && echo "FAIL: raw palette for status color" && exit 1
```

**Use instead:** `bg-danger`, `text-success`, `border-warning`, `border-premium`, `border-research`, `text-domain`, etc.

### 3. Hardcoded `bg-[#0a0e17]` (the dark-theme background hex)

```sh
# Block: hardcoded dark background hex
git diff origin/main -- src/ | grep -E '^\+.*bg-\[#0a0e17\]' && echo "FAIL: raw dark-bg hex introduced" && exit 1
```

**Use instead:** `bg-background` (defined in `src/app/globals.css`).

### 4. Inconsistent focus rings

```sh
# Block: cyan focus rings (must use the brand token)
git diff origin/main -- src/ | grep -E '^\+.*focus-visible:ring-cyan' && echo "FAIL: use focus-visible:ring-brand instead" && exit 1
```

**Use instead:** `focus-visible:ring-brand`.

---

## How to wire this into CI

### Option A — Shell script in CI pipeline

Add to your CI pipeline (e.g. Vercel build, GitHub Action):

```yaml
- name: Design system check
  run: bash planning/CI_GATES.sh
```

Where `planning/CI_GATES.sh` is:

```sh
#!/usr/bin/env bash
set -e

echo "Running design-system CI gates..."

# Block new raw hex colors
if git diff origin/main -- src/ | grep -E '^\+.*(bg|text)-\[#[0-9a-fA-F]'; then
  echo ""
  echo "❌ FAIL: raw hex bg/text color introduced."
  echo "Use semantic tokens: bg-background, text-warning, etc."
  echo "See planning/CI_GATES.md for details."
  exit 1
fi

# Block raw palette for status/semantic meaning
if git diff origin/main -- src/ | grep -E '^\+.*(bg|text|border|ring)-(red|emerald|amber|yellow|fuchsia|violet|orange|pink|rose|indigo|sky|teal|cyan|blue|purple|lime|green)-[0-9]+'; then
  echo ""
  echo "❌ FAIL: raw palette for status color introduced."
  echo "Use semantic tokens: bg-danger, text-success, etc."
  echo "See planning/CI_GATES.md for details."
  exit 1
fi

# Block hardcoded dark bg
if git diff origin/main -- src/ | grep -E '^\+.*bg-\[#0a0e17\]'; then
  echo ""
  echo "❌ FAIL: raw dark-bg hex introduced."
  echo "Use bg-background instead."
  echo "See planning/CI_GATES.md for details."
  exit 1
fi

# Block cyan focus rings
if git diff origin/main -- src/ | grep -E '^\+.*focus-visible:ring-cyan'; then
  echo ""
  echo "❌ FAIL: cyan focus ring introduced."
  echo "Use focus-visible:ring-brand instead."
  echo "See planning/CI_GATES.md for details."
  exit 1
fi

echo "✅ All design-system gates passed."
```

### Option B — `pre-commit` hook (local enforcement)

```sh
# In .husky/pre-commit or equivalent
bash planning/CI_GATES.sh
```

This catches regressions at commit time, before they reach CI.

---

## What is NOT blocked (yet)

These items are tracked but not yet enforced:

- **Arbitrary `text-[Npx]` (typography floor)** — see Phase 4.4 in `UI_UX_REMEDIATION_PLAN.md`. Per-component review required to distinguish informational vs. decorative.
- **Arbitrary `w-[Npx]` / `h-[Npx]` / `px-[Npx]`** — see Phase 2.5. Mechanical codemod not yet performed; ~1,233 occurrences.
- **`Math.random()` for IDs** (L1) — see BUG-012.
- **Console.log statements** (M8) — see BUG-026. Fixed once, may regress.

These will be added to the gate once the corresponding phases ship.

---

## Verification

After this gate is wired, the following should all pass:

```sh
$ git diff origin/main -- src/ | grep -E '^\+.*(bg|text)-\[#[0-9a-fA-F]' | wc -l
0

$ git diff origin/main -- src/ | grep -E '^\+.*(bg|text|border|ring)-(red|emerald|amber|yellow|fuchsia|violet)-[0-9]+' | wc -l
0

$ git diff origin/main -- src/ | grep -E '^\+.*bg-\[#0a0e17\]' | wc -l
0

$ git diff origin/main -- src/ | grep -E '^\+.*focus-visible:ring-cyan' | wc -l
0
```
