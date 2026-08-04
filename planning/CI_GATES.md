# CI Gates — Prevent Design-System Regressions

> **Purpose:** Block new design-system violations in `src/**` so the codebase
> stays on the semantic-token standard established in `globals.css`.
> **Wired into CI:** `ci-gate` job in `.github/workflows/test.yml`.
> **v2 (2026-08):** Derived from a quality-baseline audit — 88% of files
> already follow the design system. The 12% that don't are pre-existing
> violations. The script only fails on **new** lines (`^\+`).

---

## Baseline (2026-08 audit)

| Pattern | Files clean | Files dirty |
|---|---|---|
| Color violations (raw hex / raw white / raw palette) | **573 / 651 (88%)** | 78 |
| Color violations + arbitrary typography | **560 / 651 (86%)** | 91 |

**Gold-standard exemplars** (zero violations, >150 token uses):
- `components/game/MarketPanel.tsx` (259 token uses, 0 violations)
- `components/game/StoragePanel.tsx` (241 uses, 0 violations)
- `components/game/DashboardPanel.tsx` (244 uses, 0 violations)
- `components/game/MegaProjectPanel.tsx` (173 uses, 0 violations)
- `components/game/QuestPanel.tsx` (190 uses, 0 violations)
- `components/game/PayoutPanel.tsx` (134 uses, 0 violations)

**Pre-existing violation concentration** (admin pages):
- `app/admin/config/page.tsx` — 24 `text-white`
- `app/admin/admins/page.tsx` — 21 `text-white`
- `app/admin/actions/admin/page.tsx` — 19 `text-white`
- `app/admin/login/page.tsx` — 5 `bg-[#hex]` + 6 `text-white`
- `components/game/LoginFloatingPanel.tsx` — 5 `bg-[#hex]`
- `components/game/CloudSyncBlockBanner.tsx` — 4 `bg-[#hex]`

---

## What is blocked (v2)

The following patterns are **banned** in `src/**` for new code. CI fails
the PR if any appear in the diff (only `^\+` lines, never existing code).

### 1. Raw hex in any utility class

```sh
# Block: new raw hex in bg-/text-/border-/ring-/shadow-/fill-/stroke-
git diff origin/main -- src/ | grep -E '^\+.*\b(bg|text|border|ring|shadow|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]'
```

**Use instead:** semantic tokens (`bg-background`, `text-warning`,
`border-success`, `bg-industrial-card`, `shadow-brand/20`, etc.).

### 2. Raw `text-white` / `text-black` (new in v2)

```sh
# Block: raw white/black (breaks theming on dark theme)
git diff origin/main -- src/ | grep -E '^\+.*\b(bg|text|border|ring|fill|stroke)-(white|black)(-[0-9]+)?\b'
```

**Use instead:**
- `text-white` → `text-foreground` (primary text)
- `text-white/80` → `text-muted-label` (secondary text)
- `text-black` → `text-foreground` on dark bg / `text-muted-label` for inverse

### 3. Raw Tailwind palette for status / semantic meaning

```sh
# Block: raw palette for status color
git diff origin/main -- src/ | grep -E '^\+.*\b(bg|text|border|ring)-(red|emerald|amber|yellow|fuchsia|violet|orange|pink|rose|indigo|sky|teal|cyan|blue|purple|lime|green)-[0-9]+'
```

**Use instead:** `bg-danger`, `text-success`, `border-warning`,
`border-premium`, `border-research`, `text-domain`, etc.

### 4. Hardcoded `bg-[#0a0e17]` (defense in depth)

```sh
git diff origin/main -- src/ | grep -E '^\+.*\bbg-\[#0a0e17\]'
```

**Use instead:** `bg-background` (defined in `src/app/globals.css`).

### 5. Cyan focus rings

```sh
git diff origin/main -- src/ | grep -E '^\+.*focus-visible:ring-cyan'
```

**Use instead:** `focus-visible:ring-brand`.

### 6. `useGameStore()` without selector (new in v2)

```sh
# Matches `useGameStore()` but NOT `useGameStore((s) => ...)` or `useGameStore.getState()`
git diff origin/main -- src/ | grep -E '^\+.*\buseGameStore\(\)'
```

**Why:** Bare `useGameStore()` subscribes to the entire store, causing
re-renders on every state change. Per `AGENT.md` forbidden patterns.
Use a selector: `useGameStore((s) => s.foo)`.

---

## Design-token catalog (reference)

From `src/app/globals.css`:

| Category | Tokens |
|---|---|
| Surfaces | `bg-background`, `bg-card`, `bg-muted`, `bg-popover`, `bg-accent`, `bg-secondary`, `bg-destructive`, `bg-industrial-dark`, `bg-industrial-card`, `bg-industrial-border`, `bg-industrial-hover` |
| Text | `text-foreground`, `text-muted-foreground`, `text-muted`, `text-muted-label`, `text-subtle`, `text-dim` |
| Status | `text-success`, `bg-success`, `border-success`, `text-danger`, `bg-danger`, `border-danger`, `text-warning`, `bg-warning`, `border-warning` |
| Brand | `text-brand`, `bg-brand`, `border-brand`, `ring-brand` |
| Domain | `text-premium`, `text-research`, `text-domain`, `text-industrial`, `text-rose`, `text-fuchsia`, `text-violet`, `text-pink`, `text-teal`, `text-sky`, `text-indigo`, `text-lime` |
| Borders | `border-border`, `border-input`, `border-ring` |
| Tier | `text-tier-bronze`, `text-tier-silver`, `text-tier-gold`, `text-tier-platinum`, `text-tier-diamond` |
| Neon | `text-neon-cyan`, `text-neon-green`, `text-neon-orange`, `text-neon-purple`, `text-neon-red`, `text-neon-yellow`, `text-neon-blue` |

---

## How to wire this into CI

The `ci-gate` job in `.github/workflows/test.yml` runs the script on every PR:

```yaml
- name: Run design-system CI gates
  if: github.event_name == 'pull_request'
  run: bash planning/CI_GATES.sh origin/${{ github.base_ref }}
```

The script:
1. `git diff origin/main -- src/` to find lines being added
2. Greps each forbidden pattern with `^\+` to check only new lines
3. Exits 1 with the offending lines + a fix hint

---

## Verification

```sh
$ bash planning/CI_GATES.sh
Running design-system CI gates against origin/main...
✅ All design-system gates passed.
```

---

## Pre-existing violations (NOT in scope for the gate)

The 12% of files with violations must be migrated over time:

| Pattern | Count | Files |
|---|---|---|
| `text-white` | ~317 | `app/admin/**` (concentrated) |
| `bg-[#hex]` | ~23 | `app/admin/login`, `LoginFloatingPanel`, `CloudSyncBlockBanner` |
| Raw palette status | 3 | `FingerprintStatusNotice` (2), `ResourcePanel` (1) |
| Arbitrary `text-[Npx]` | ~1251 | Spread across game panels (10/11px are intentional per design) |

**Migration strategy**: The v2 gate doesn't block these, but every new
PR touching these files should migrate the surrounding code. Use
`node _audit-design-system.mjs` to find the worst offenders.

---

## What is NOT blocked (yet)

These are tracked but not yet enforced (false-positive prone or too invasive):

- **Arbitrary `text-[Npx]`** — the design system itself uses `text-[10px]`
  and `text-[11px]` for micro-labels (see `globals.css` typography
  comment). Banning arbitrary text sizes would require per-component
  review to distinguish informational vs. decorative. Defer to ESLint
  plugin work.
- **`Math.random()` for IDs** — 0 hits in code (3 false positives in
  comments). Already replaced by `crypto.randomUUID()` everywhere.
- **`console.log`** — 3 hits in `bootstrap.server.ts`. Better caught by
  ESLint `no-console` rule with a project-specific exception list.

These will be added once the corresponding ESLint rules land.

---

## Changelog

- **v2 (2026-08)** — Quality-baseline audit. Extended to cover `border-`,
  `ring-`, `shadow-`, `fill-`, `stroke-[#hex]`. New rule for raw
  `text-white`/`text-black` (88% of files already follow this standard).
  New rule for bare `useGameStore()`. All rules check only `^\+` lines
  so pre-existing violations don't break the build.
- **v1 (2026-06-17)** — Initial 4 rules: raw hex bg/text, raw palette
  status, hardcoded dark bg, cyan focus rings.
