# Phase 05 - UI System Foundation (Design Tokens and Composites)

## Status: PENDING
## Predecessor: Phase 04 Architecture Decomposition
## References: UI_ARCHITECTURE_BLUEPRINT.md, UI_IMPLEMENTATION_EXECUTION_PLAN.md Phase 1,
##              PHASE_1D_TECHNICAL_DEBT_PLAN.md section 3, ARCHITECTURE_BASELINE_REPORT.md section 5

---

## Background

Two documents define the UI system work:

UI_ARCHITECTURE_BLUEPRINT.md (2025-01-13):
  - Target: 4-layer architecture (Primitives, Composites, Panel Framework, Screen Composer)
  - Status: DRAFT - Design Only, No Implementation
  - Key design decisions: progressive disclosure, bottom nav (5+More), game industry patterns

UI_IMPLEMENTATION_EXECUTION_PLAN.md (2025-01-13):
  - Phase 1 (Design System): tokens + 6 composite components
  - Phase 2 (Navigation): header extraction, bottom nav redesign
  - Status: DRAFT - Awaiting Approval
  - Phases 2-6 not started

Phase 1D-E claimed 2,469 color replacements with 11 semantic tokens.
Audit found semantic tokens NOT in globals.css. 1D-E is unimplemented.

Current hardcoded color inventory (from PHASE_1D_TECHNICAL_DEBT_PLAN.md section 3):
  Total instances:          ~2,910
  text-green-400:           ~195 instances in 40+ files
  text-gray-500:            ~280 instances in 45+ files
  text-red-400:             ~150 instances in 35+ files
  text-cyan-400:            ~145 instances (text-primary token exists but unused)
  text-amber-400/yellow-400: ~145 instances in 35+ files
  bg-[#0a0e17]:             ~30 instances (bg-industrial-dark token exists but unused)

Top offender panels:
  DashboardPanel.tsx:  236 hardcoded colors
  TransportPanel.tsx:  181 hardcoded colors
  MarketPanel.tsx:     181 hardcoded colors
  FactoryMapPanel.tsx: 161 hardcoded colors
  PowerPanel.tsx:      143 hardcoded colors

---

## Objective

Establish the design token system and create the 6 core composite components
that will be used by all panel migrations. This unblocks Phase 06 (Navigation + Panels).

---

## Task Breakdown

### 05.1 Color Token Extraction

Reference: PHASE_1D_TECHNICAL_DEBT_PLAN.md section 3

Step 1 - Add semantic tokens to globals.css @theme inline block:
  --color-success: #4ade80        replaces text-green-400
  --color-danger: #f87171         replaces text-red-400
  --color-warning: #facc15        replaces text-yellow-400 / text-amber-400
  --color-brand: #22d3ee          replaces text-cyan-400 (already text-primary, use that)
  --color-muted-label: #6b7280    replaces text-gray-500
  --color-subtle: #9ca3af         replaces text-gray-400
  --color-dim: #4b5563            replaces text-gray-600
  --color-premium: #e879f9        replaces text-fuchsia-400 (prestige)
  --color-research: #c084fc       replaces text-purple-400 (research)

Existing tokens to activate (already defined but not used):
  bg-industrial-dark   replaces bg-[#0a0e17]
  bg-industrial-card   replaces bg-[#111827]

Step 2 - Migrate by semantic group (one group per commit for rollback safety):
  Group 1: success (text-success, bg-success/20, border-success) - 580+ instances
  Group 2: muted labels (text-muted-label replacing text-gray-500) - 280+ instances
  Group 3: danger (text-danger, bg-danger/20) - 200+ instances
  Group 4: warning (text-warning) - 145+ instances
  Group 5: existing industrial tokens (bg-industrial-dark, bg-industrial-card) - 60+ instances
  Group 6: domain-specific (research, premium/prestige) - 125+ instances

Step 3 - Visual regression check after each group migration.

### 05.2 Composite Components

Reference: UI_IMPLEMENTATION_EXECUTION_PLAN.md Phase 1 scope

6 core composites to create in src/components/game/shared/:
  1. StatCard - replaces 40+ independently implemented stat display cards
  2. ProgressBar - replaces ~40 progress bars across 15 panels
  3. ResourceBadge - resource icon + name + amount, used in ~30 panels
  4. BuildingCard - building info display card (currently each panel reimplements)
  5. SectionHeader - consistent panel section heading pattern
  6. EmptyState - consistent empty list/no-data state across panels

Each composite must:
  - Accept className prop for customization
  - Use semantic tokens (not hardcoded colors)
  - Have JSDoc with usage example
  - Not wrap any shadcn/ui component directly (use shadcn underneath)

### 05.3 PanelShell Framework

Reference: UI_ARCHITECTURE_BLUEPRINT.md section 1 Layer 3

Create in src/components/game/shared/:
  PanelShell.tsx    - consistent outer container (padding, background, border)
  PanelHeader.tsx   - title + badge + action slot (consistent across all panels)
  PanelBody.tsx     - scrollable content area with correct overflow

Usage:
  <PanelShell>
    <PanelHeader title=Resources badge=67 types action={<FilterButton />} />
    <PanelBody>
      {content}
    </PanelBody>
  </PanelShell>

### 05.4 Reconcile UI Blueprint vs Current Code

Compare UI_ARCHITECTURE_BLUEPRINT.md and UI_IMPLEMENTATION_EXECUTION_PLAN.md
section by section against current code. Mark each section as:
  APPLICABLE NOW - can implement in upcoming phases
  DEFERRED - valid but not yet time
  SUPERSEDED - the code has diverged, plan no longer accurate

Produce: planning/UI_ALIGNMENT_BASELINE.md

---

## Deliverables

1. Semantic color tokens in globals.css (11 new tokens)
2. All 6 color groups migrated (~2,910 instances replaced)
3. 6 composite components in src/components/game/shared/
4. PanelShell, PanelHeader, PanelBody components
5. planning/UI_ALIGNMENT_BASELINE.md

---

## Dependencies

- Phase 04 complete (stable, decomposed components before migrating their styles)

---

## Validation

  # Verify no raw hex colors remain in game components
  grep -r 'bg-\[#' src/components/game/     # should return 0
  grep -r 'text-green-400' src/components/game/ # should return 0

  bun run lint  # 0 errors

- Browser: visual spot check on all 10 largest panels - no color regressions
- Browser: composite components render correctly in isolation

## Exit Criteria

- All 11 semantic tokens defined in globals.css
- Group migrations complete (grep shows near-zero raw hardcoded classes)
- 6 composite components exist and are used in at least 3 panels each
- PanelShell framework exists
- planning/UI_ALIGNMENT_BASELINE.md exists with section-level blueprint reconciliation
