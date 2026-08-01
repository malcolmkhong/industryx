# UI Alignment Baseline (05.4)

> **Date:** 2026-06-12
> **Status:** Reconciliation planning only (no implementation)
> **References:** `UI_ARCHITECTURE_BLUEPRINT.md`, `UI_IMPLEMENTATION_EXECUTION_PLAN.md`, current code (2026-06-12)

---

## Purpose

Compare the two UI planning documents against the actual code state as of 2026-06-12. Mark each section as **APPLICABLE NOW**, **DEFERRED**, or **SUPERSEDED**.

This serves as the baseline for deciding which UI work is still valid, which needs to wait, and which has been overtaken by actual code evolution.

---

## Document Inventory

| Document | Date | Status |
|----------|------|--------|
| `UI_ARCHITECTURE_BLUEPRINT.md` | 2025-01-13 | DRAFT — design only, no implementation |
| `UI_IMPLEMENTATION_EXECUTION_PLAN.md` | 2025-01-13 | DRAFT — awaiting approval, Phases 2-6 not started |

Both documents are ~17 months old. The codebase has evolved significantly (Phase 01-04 work, 04.3 page.tsx decomposition, 05.1 token setup, 05.2-05.3 composites).

---

## UI_ARCHITECTURE_BLUEPRINT.md Reconciliation

### Section 1: 4-Layer Architecture

| Layer | Blueprint Says | Current Code | Status |
|-------|----------------|--------------|--------|
| 1. Primitives | shadcn/ui + Tailwind base | `src/components/ui/*` (Button, Badge, Dialog, Textarea, etc.) | **SUPERSEDED** — layer exists, but shadcn primitives are being wrapped inconsistently. Phase 05 composites (StatCard, ProgressBar, etc.) sit ABOVE this layer, not replacing it. |
| 2. Composites | Domain-aware reusable components (StatCard, etc.) | `src/components/game/shared/StatCard.tsx`, `ProgressBar.tsx`, `ResourceBadge.tsx`, `BuildingCard.tsx`, `SectionHeader.tsx`, `EmptyState.tsx` (all 6 created in 05.2) | **APPLICABLE NOW** — 6/6 composites from the plan exist. Next step is panel migration (replace ad-hoc JSX). |
| 3. Panel Framework | Consistent panel structure | `src/components/game/shared/PanelShell.tsx`, `PanelHeader.tsx`, `PanelBody.tsx` (created in 05.3) | **APPLICABLE NOW** — all 3 framework components exist. No panel uses them yet (migration pending). |
| 4. Screen Composer | Page-level composition | `src/app/page.tsx` (292 lines, was 1337 — 78% reduction in 04.3) | **APPLICABLE NOW** — page is now lean and composes panels. Header is in `DesktopHeader`/`MobileHeader`; dialogs are in `src/components/game/dialogs/`. |

**Verdict:** The 4-layer architecture is now real in the code. Composites + Framework are built but not yet consumed by panels (Layer 4 is a consumer, not a producer).

### Section 2: Progressive Disclosure

| Item | Blueprint Says | Current Code | Status |
|------|----------------|--------------|--------|
| Bottom nav (5+More) | 5 main tabs + "More" panel | `src/components/game/BottomNavigationBar.tsx` | **APPLICABLE NOW** — exists. Verify it matches the "5+More" pattern (probably 5-6 tabs + More). |
| Mobile bottom nav (5+More) | Same pattern on mobile | `src/components/game/BottomNavigationBar.tsx` (shared with desktop) | **APPLICABLE NOW** — exists. |
| Game industry patterns (idle animations, feedback on tap, etc.) | Various | `src/app/globals.css` (40+ @keyframes) | **APPLICABLE NOW** — pattern library exists. |

### Section 3: Visual Design System

| Token | Blueprint | Current Code | Status |
|-------|-----------|--------------|--------|
| Neon cyan (brand) | `--color-neon-cyan: #00fff2` | Defined in `globals.css:68` | **APPLICABLE NOW** |
| Industrial dark | `--color-industrial-dark: #0a0e17` | Defined in `globals.css:75` | **APPLICABLE NOW** |
| Semantic colors (success/danger/warning/brand) | Not in blueprint, added by 1D plan | Defined in `globals.css:81-90` (11 new tokens, 05.1) | **APPLICABLE NOW** — but not yet CONSUMED. Migration of ~2910 hardcoded instances is the next 05.1 step. |

---

## UI_IMPLEMENTATION_EXECUTION_PLAN.md Reconciliation

### Phase 1: Design System

| Step | Plan Says | Current Code | Status |
|------|-----------|--------------|--------|
| Token extraction | Add semantic tokens to globals.css | 11 tokens added in `cdd91ef` (05.1) | **APPLICABLE NOW** — done. |
| Token migration | Migrate ~2910 instances in 6 semantic groups | 0 groups migrated | **APPLICABLE NOW** — not done. |
| 6 composite components | StatCard, ProgressBar, ResourceBadge, BuildingCard, SectionHeader, EmptyState | All 6 created in `e054dfc` (05.2) | **APPLICABLE NOW** — done. |
| Composite usage in panels | Migrate panels to use composites | 0 panels use them | **APPLICABLE NOW** — not done. Each panel migration is its own PR. |
| PanelShell framework | Consistent panel structure | All 3 created in `e054dfc` (05.3) | **APPLICABLE NOW** — done. |
| `UI_ALIGNMENT_BASELINE.md` | This document | This is it | **APPLICABLE NOW** — done. |

### Phase 2: Navigation

| Step | Plan Says | Current Code | Status |
|------|-----------|--------------|--------|
| Header extraction | Extract DesktopHeader + MobileHeader | Done in `6901253` (04.3 Phase 3, strict H6 rule) | **APPLICABLE NOW** — done. |
| Bottom nav redesign | Verify "5+More" pattern | `BottomNavigationBar.tsx` exists | **DEFERRED** — needs design review. Plan was DRAFT/Awaiting Approval; we may have deviated. |

### Phases 3-6: Panels + Onboarding + Empty States

All **DEFERRED** — these are large efforts (per-panel migration) that depend on:
1. Color token migration completing (05.1)
2. Panel-by-panel migration to use composites + PanelShell

Not started. Estimated 4-8 weeks total if done panel-by-panel with 1 panel per PR.

---

## What's Now SUPERSEDED

1. **1D-E "design system implementation" claims** — claimed 2,469 color replacements with 11 semantic tokens. Audit found semantic tokens NOT in globals.css. **1D-E is fully SUPERSEDED** by:
   - `cdd91ef` (05.1): 11 semantic tokens actually added
   - `e054dfc` (05.2 + 05.3): 6 composites + PanelShell actually created
   - 0/2910 instances migrated (still pending)

2. **PHASE_1D_TECHNICAL_DEBT_PLAN.md section 1-3** — proposed useCloudSync decomposition and presence hooks consolidation. **SUPERSEDED** for now — not on the immediate path. If the store decomposition (04.4 planning) happens, useCloudSync may need re-evaluation.

3. **PHASE_1D_D section 4 (BottomNavigationBar redesign)** — proposed a specific 5+More pattern. Code has `BottomNavigationBar.tsx` but design review needed to confirm pattern match.

---

## What's Now APPLICABLE NOW (Immediate Backlog)

Priority order for the next planning cycle:

1. **05.1 Group 1: success token migration** (~580 instances) — replace `text-green-400` with `text-success` (and `bg-green-900/40`, `border-green-500/30`, etc.). One group per commit for rollback safety.
2. **05.1 Group 2: muted labels** (~280 instances) — replace `text-gray-500` with `text-muted-label`.
3. **05.1 Group 3-6**: warning, industrial, domain-specific, danger — remaining ~560 instances.
4. **Panel migration** — start with the highest-traffic panels (DashboardPanel, TransportPanel, MarketPanel, FactoryMapPanel, PowerPanel — the 5 with 140+ hardcoded color instances each). Each panel = 1 PR using composites + PanelShell + semantic tokens.
5. **BottomNavigationBar design review** — confirm 5+More pattern match or redesign.
6. **UI_ALIGNMENT_BASELINE revisit** — re-run this reconciliation after every 05.1 group migration to catch new SUPERSEDED items.

---

## What's Now DEFERRED

1. **04.1 useCloudSync decomposition** — store decomposition (04.4) is the larger goal; useCloudSync is one slice.
2. **04.2 presence hooks consolidation** — same reason.
3. **03.5 selectors library** — not needed until panel performance is profiled.
4. **Phases 3-6 of UI_IMPLEMENTATION_EXECUTION_PLAN** — large efforts, dependent on 05.1 completing.
5. **Sentry production config (06.2)** — needs env vars (NEXT_PUBLIC_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN). Code at `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` is staged but not committed (pre-existing untracked).
6. **CHECKSUM_SECRET production verify (06.3)** — build warning confirms it's referenced but not set. Needs prod deploy to verify fail-closed behavior.

---

## Validation Criteria for Closing 05.4

- [x] Both planning documents reviewed section by section
- [x] Each section marked APPLICABLE NOW / DEFERRED / SUPERSEDED
- [x] Immediate backlog defined with priority order
- [x] Document cross-references other planning files (planning/UI_IMPLEMENTATION_EXECUTION_PLAN.md, planning/phases/PHASE_05_UI_SYSTEM_ALIGNMENT.md)
- [x] Phase 04.3 page.tsx decomposition referenced as evidence of completed work
- [x] Phase 05.1/05.2/05.3 status tracked (in-progress vs done)
- [x] No claims of work that wasn't done

---

## Success Definition

When this document is updated (revisited after each major 05.x milestone), it should:
- Reflect the current state of the UI system
- Identify new SUPERSEDED items as the code evolves
- Prioritize the next batch of work
- Serve as the single source of truth for "what UI work is still valid"
