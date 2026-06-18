# UI_UX_REMEDIATION_PLAN — Full UI/UX & Frontend Architecture Audit Fixes

**Source audit:** External "IndustriaX — Factory Dominion: Full UI/UX & Frontend Architecture Audit" report (2026-06-17)
**Source verification:** `BUGS.md` entries BUG-014 through BUG-030 (added 2026-06-17)
**Date:** 2026-06-17
**Estimated effort:** 2–3 weeks of focused engineering
**Target:** Bring the platform score from 74/100 ("Strong Beta / Near Production") to 90+/100 ("Production Ready")

---

## Authority & Trust Chain

This plan covers the **frontend presentation layer only**. It does not change:

- The Zustand store contract (`src/lib/game/store.ts`)
- The server-side validation pipeline (`/api/game/action` + `gameStateValidator.ts`)
- The Supabase database schema
- The auth flow (`AuthProvider`, `useLoginPrompt`, `useCloudSync`)

Every change preserves the existing data shape, server validation, and security posture. The plan is organized into 5 phases, each independently shippable and visually verifiable.

---

## Forbidden Patterns

The following are explicitly banned as part of this work:

- **Eager imports of panels in `page.tsx`** — must use `next/dynamic` for all non-default panels
- **Raw hex colors (`bg-[#0a0e17]`, `text-[#fff]`, etc.)** in component code — must use semantic tokens
- **Raw Tailwind palette colors** (`bg-amber-900`, `text-zinc-400`, `bg-red-500`, etc.) for status/semantic meanings — must use `bg-warning`, `text-muted-label`, `bg-danger`, etc.
- **Emoji used as functional icons** — must use `lucide-react`
- **Raw `<img>` tags** for any content — must use `next/image`
- **`<div role="marquee">`** without pause control and without `prefers-reduced-motion` guard
- **Icon-only `<button>` without `aria-label`**
- **Active tab without `aria-current="page"`**
- **Text below 11px** for informational content
- **Dead code (unused variables, unused imports, dead files, console.log)**

Any new code or PR that introduces one of these patterns is automatically rejected in review. The new `planning/CI_GATES.md` (Phase 2 deliverable) encodes the grep rules.

---

## Overview

The audit enumerated 21 issues (C1–C3, H1–H6, M1–M8, L1–L4). Verification in `BUGS.md` (BUG-014 through BUG-030) confirmed 17 as real, 4 as partially confirmed with corrected magnitudes, and 0 as invalid. None were "already fixed."

The work is organized into 5 phases:

| Phase | Theme | Effort | Risk | Bugs addressed |
|---|---|---|---|---|
| 1 | Quick wins (low risk, high value) | S | Low | BUG-016, 023, 024, 026, 027, 028, 029, 030 |
| 2 | Design-token sweep | L | Low | BUG-017, 025 |
| 3 | Performance | M | Med | BUG-014, 020 |
| 4 | Accessibility & responsive | M | Med | BUG-015, 018, 019, 021, 022 |
| 5 | Verification | S | — | (all) |

**Critical sequencing rule:** Do not start Phase 3 (lazy-loading panels) before Phase 1's `L1`/`L2`/`L3` cleanup is done — the cleanup touches `page.tsx` and `GameSidebar.tsx`, and merging both at once makes review hard. Likewise, Phase 2's codemod should be done panel-by-panel to keep visual regressions reviewable.

**Authority rule:** Every change is a refactor or addition at the presentation layer. No game mechanics, no API contracts, no DB schema, no auth flow may be modified.

---

## Phase 1 — Quick Wins (Day 1, 2–4 hours)

**Why first:** All work is localized, low-risk, and verifiable in a single browser session. Clearing these creates a clean baseline for Phase 2+.

### 1.1 Replace `📰` with `<Newspaper />` icon (BUG-016)

**Action:** `src/components/game/headers/DesktopHeader.tsx:505`

**Before:**
```tsx
<span className="text-[10px] text-brand font-bold mr-3 shrink-0">📰 NEWS</span>
```

**After:**
```tsx
import { Newspaper } from 'lucide-react';
// …
<span className="text-[10px] text-brand font-bold mr-3 shrink-0 flex items-center gap-1">
  <Newspaper className="w-3 h-3" aria-hidden="true" />
  NEWS
</span>
```

Also: replace `⚙️` emoji in `src/lib/game/data.ts:2` with the `Cog` icon usage where it's rendered (or remove if no longer rendered).

### 1.2 Remove dead `powerPercent` variable (BUG-029)

**Action:** `src/app/page.tsx:261` — delete the line:
```ts
const powerPercent = 0; // unused after header extraction (DesktopHeader computes internally)
```

**Verification:** `grep "powerPercent" src/app/page.tsx` returns no results.

### 1.3 Resolve the unused `Swords` icon registration (BUG-028)

**REVISED 2026-06-17 (user-flagged):** My original Phase 1.3 called for removing the `Swords` import. **The user correctly pointed out this could be a broken connection, not dead code.** Verification shows:

- `Swords` IS registered in `ICON_MAP` at `BottomNavigationBar.tsx:25`:
  ```ts
  export const ICON_MAP = { ..., Activity, Save, Swords };
  ```
- `ICON_MAP` is consumed by `FloatingActionButton.tsx:72` and `SettingsPanel.tsx:668` via `ICON_MAP[shortcut.icon]`.
- The chain is intact: a Quick Access shortcut with `icon: "Swords"` would render the icon correctly.

**The "broken connection" is upstream** — no `GameTab` / shortcut / feature currently uses the `"Swords"` key. There is no `'battles'` / `'arena'` / `'combat'` / `'fight'` tab in `src/lib/game/types.ts`.

**Action:** Pick one of:

- **(Recommended) Keep + annotate.** Add a comment in `BottomNavigationBar.tsx:25`:
  ```ts
  // Swords reserved for future PvP / Battles feature (no GameTab yet)
  Activity, Save, Swords,
  ```
  Do not remove the import or the ICON_MAP entry. If/when a PvP feature ships, the icon is already wired.
- **Alternative: Remove.** If you confirm no PvP feature is planned:
  - `GameSidebar.tsx:10` — remove `Swords` from the lucide import
  - `BottomNavigationBar.tsx:14` — remove `Swords` from the lucide import
  - `BottomNavigationBar.tsx:25` — remove `Swords` from the ICON_MAP

**Verification (if removing):** `grep "Swords" src/components/game/GameSidebar.tsx src/components/game/BottomNavigationBar.tsx` returns no results.

**Why this is not the original recommendation:** the audit asked to "verify it's referenced by FAB" — it is, via `ICON_MAP`. The chain `Swords → ICON_MAP → FAB` is wired. The disconnect is at the feature level, not the icon level.

### 1.4 Replace 3 `console.log` with `logger.*` (BUG-026)

**Action:**
- `src/components/game/shared/IconPreloader.tsx:59`
- `src/components/providers/GameConfigProvider.tsx:124,127`

**Steps:**
1. Find/verify `src/lib/logger.ts` exists (per `PROJECT_STATUS_SOURCE_OF_TRUTH.md` C6 fix).
2. Replace each `console.log(...)` with `logger.debug(...)` (or `logger.info(...)` if informative).
3. Verify with `npm run build` that no `console.log` remains in production output.

### 1.5 Reorganize `MarketPriceChart.tsx` (BUG-027, option A — minimum risk)

**REVISED 2026-06-17 (user-flagged):** The audit flagged this as "empty directory" implying dead code. **The user correctly suspected this could be a broken connection, not dead code.** Verification shows `MarketPriceChart.tsx` IS in active use:
- Imported in `src/components/game/TradingPostPanel.tsx:29`
- Rendered at `src/components/game/TradingPostPanel.tsx:783` (`<MarketPriceChart resourceId={giveResource} hours={24} width={7600} height={120} className="w-full" />`)

The file is **not** dead. The issue is **only** the directory structure — a subdirectory containing one helper while the main panel lives in the parent. The "broken connection" hypothesis (file planned for a feature that was never wired) does NOT apply.

**Action (option A — minimum risk):** Flatten the co-location.

**Steps:**
1. `git mv src/components/game/TradingPostPanel/MarketPriceChart.tsx src/components/game/MarketPriceChart.tsx`
2. `rmdir src/components/game/TradingPostPanel`
3. Update the import in `src/components/game/TradingPostPanel.tsx` from `./TradingPostPanel/MarketPriceChart` → `./MarketPriceChart`.
4. Build to verify no broken imports.

**Why this still matters even though the file is not dead:** the subdirectory containing a single file is confusing for new contributors and makes the file harder to find. The cleanup is a directory-structure fix, not a deletion.

### 1.6 Persist `expandedGroups` in `useSettingsStore` (BUG-023)

**Action:** `src/components/game/GameSidebar.tsx:165`

**Before:**
```ts
const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['production']));
```

**After:**
```ts
import { useSettingsStore } from '@/lib/game/settingsStore';
// …
const expandedGroups = useSettingsStore((s) => s.expandedGroups);
const setExpandedGroups = useSettingsStore((s) => s.setExpandedGroups);
```

Add `expandedGroups: Set<string>` and `setExpandedGroups: (g: Set<string>) => void` to the `useSettingsStore` shape (file `src/lib/game/settingsStore.ts`).

### 1.7 Add `aria-current="page"` to active tabs (BUG-024)

**Action:**
- `src/components/game/GameSidebar.tsx:221` — find the active tab `<button>` and add `aria-current={isActive ? 'page' : undefined}`
- `src/components/game/BottomNavigationBar.tsx:171` — same

### 1.8 Fix the news ticker a11y in one pass (BUG-015 + BUG-030)

**Action:** `src/components/game/headers/DesktopHeader.tsx:503-510` + `src/app/globals.css`

**Recommended approach (single fix, resolves both BUGs):** replace the marquee with a static rotating list.

**Before (DesktopHeader):**
```tsx
<div className="hidden lg:block bg-industrial-dark ... overflow-hidden h-6" role="marquee" aria-live="off" aria-label="Live news feed">
  <span ...>📰 NEWS</span>
  <div className="news-ticker-content text-[11px] text-subtle" aria-hidden="true">
    {notifications.slice(0, 8).map((n, i) => ( <span key={n.id}>...</span> ))}
  </div>
</div>
```

**After:**
```tsx
const [headlineIndex, setHeadlineIndex] = useState(0);
const top3 = notifications.slice(0, 3);

useEffect(() => {
  if (top3.length < 2) return;
  const t = setInterval(() => setHeadlineIndex((i) => (i + 1) % top3.length), 5000);
  return () => clearInterval(t);
}, [top3.length]);

return (
  <div
    className="hidden lg:flex items-center h-6 px-3 gap-2 bg-industrial-dark border-t border-brand/20"
    role="region"
    aria-label="Live news feed"
  >
    <Newspaper className="w-3 h-3 text-brand shrink-0" aria-hidden="true" />
    <span className="text-[10px] text-brand font-bold shrink-0">NEWS</span>
    <ul
      className="flex-1 overflow-hidden"
      aria-live="polite"
      aria-atomic="true"
    >
      {top3[headlineIndex] && (
        <li key={top3[headlineIndex].id} className="text-[11px] text-subtle truncate">
          {top3[headlineIndex].message}
        </li>
      )}
    </ul>
    {top3.length > 1 && (
      <span className="text-[9px] text-muted-label shrink-0">
        {headlineIndex + 1}/{top3.length}
      </span>
    )}
  </div>
);
```

**And in `globals.css`:** remove the `.news-ticker-content` rule and the `@keyframes tickerScroll` (no longer needed).

This single change resolves:
- BUG-015 (no more auto-scrolling, no more WCAG 2.2.2 violation)
- BUG-030 (screen-reader users now get the top headline via `aria-live="polite"`)
- BUG-016 (emoji removed)
- Reduces 11px+ typography reliance

---

## Phase 2 — Design-Token Sweep (Day 2–3, 6–10 hours)

**Why after Phase 1:** The visual baseline is now clean (no dead code, ticker is accessible). Mechanical replacements in Phase 2 are easier to review against this baseline.

### 2.1 Replace `bg-[#0a0e17]` (BUG-017 / M1)

**Action:** Codemod 167 occurrences across 45+ files.

**Before:** `className="bg-[#0a0e17] border-t border-brand/20"`
**After:** `className="bg-background border-t border-brand/20"`

**Steps:**
1. In 5 representative components (DesktopHeader, MobileHeader, GameSidebar, BottomNavigationBar, DashboardPanel), manually replace and verify.
2. If `bg-background` matches the visual result, run a project-wide codemod:
   ```sh
   # dry-run first
   grep -rl "bg-\[#0a0e17\]" src/ | xargs sed -i 's/bg-\[#0a0e17\]/bg-background/g'
   ```
3. Visually verify each panel.

**Risk:** `bg-background` may be a different shade in some contexts. If mismatches appear, use `bg-sidebar` or `bg-card` for those cases.

### 2.2 Unify focus ring to `ring-brand` (BUG-017 / M2)

**Action:**
- `src/components/game/GameSidebar.tsx:227` — `focus-visible:ring-cyan-500/50` → `focus-visible:ring-brand`
- `src/components/game/FloatingActionButton.tsx` — `focus-visible:ring-cyan-400` → `focus-visible:ring-brand`

**Verification:** `grep -rE "ring-cyan-500|ring-cyan-400" src/` should return zero after the fix.

### 2.3 Replace `amber-*` with `warning` token (BUG-017 / M3)

**Action:** `src/components/game/GameSidebar.tsx:250-251`

**Before:** `text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20`
**After:** `text-warning hover:text-warning/80 hover:bg-warning/10 border border-transparent hover:border-warning/20`

### 2.4 Sweep remaining palette violations (BUG-017)

Use a `jscodeshift` codemod to mechanically replace:
- `text-zinc-400/500/600` → `text-muted-label` (39 occurrences)
- `text-red-400/500`, `bg-red-500` → `text-danger`, `bg-danger` (15+)
- `text-emerald-400/500` → `text-success`, `bg-success` (7+)
- `border-fuchsia-*`, `text-fuchsia-400` → `border-premium`, `text-premium` (20+)
- `border-violet-*`, `text-violet-400` → `border-research`, `text-research` (16+)
- `via-cyan-500/15`, `via-cyan-500/20` in gradients → `via-brand/15` (BUG-017 / M7)

### 2.5 Replace arbitrary values with scale (BUG-025)

For the 1,233 arbitrary values: use `tailwind-config-viewer` to find the most common values, then codemod them. Focus first on:
- `w-[Npx]` / `h-[Npx]` → nearest standard
- `px-[Npx]` / `py-[Npx]` → nearest standard
- `text-[Npx]` (10, 11, 12) → `text-xs` / `text-sm` / new `text-2xs` utility

### 2.6 Add CI gate for new raw colors (BUG-017 prevention)

**New file:** `planning/CI_GATES.md`

Define grep rules:
```sh
# Block new raw hex
git diff origin/main -- src/ | grep -E "^\+.*bg-\[#" && echo "FAIL: raw hex bg introduced" && exit 1
git diff origin/main -- src/ | grep -E "^\+.*text-\[#" && echo "FAIL: raw hex text introduced" && exit 1

# Block new raw palette for status/semantic meanings
git diff origin/main -- src/ | grep -E "^\+.*(bg|text|border)-(red|emerald|amber|yellow|fuchsia|violet)-[0-9]" && echo "FAIL: raw palette for status color" && exit 1
```

Wire this into the existing `next build` pipeline or a separate CI step.

---

## Phase 3 — Performance (Day 4–5, 4–6 hours)

### 3.1 Convert panels to `next/dynamic` (BUG-014)

**Action:** `src/app/page.tsx`

**Steps:**
1. Add imports:
   ```ts
   import dynamic from 'next/dynamic';
   const DashboardPanel = ... // keep eager (default tab)
   const AIAdvisorPanel = dynamic(() => import('@/components/game/AIAdvisorPanel'), { loading: () => <GameLoadingSkeleton /> });
   // … repeat for all 27 non-default panels
   ```
2. Add `{ ssr: false }` to any panel that fails SSR (test each).
3. Run `next build` and compare the chunk report.

**Validation:**
- Initial JS bundle should drop by ~40–60%.
- Lighthouse TBT should drop proportionally.
- Each panel must still load with skeleton, no flash of unstyled content.

### 3.2 Migrate 2 `<img>` tags to `next/image` (BUG-020)

**Action:**
- `src/components/game/headers/DesktopHeader.tsx` (line ~345)
- `src/components/game/headers/MobileHeader.tsx`

**Steps:**
1. Remove `images: { unoptimized: true }` from `next.config.ts` (or keep but document why).
2. Import `Image` from `next/image`.
3. Replace `<img src={userAvatar} alt={userName} className="w-5 h-5 rounded-full" />` with `<Image src={userAvatar} alt={userName} width={20} height={20} className="rounded-full" />`.
4. If avatars come from Supabase storage, add `images.remotePatterns` to `next.config.ts`.

### 3.3 Pause tick loop on `document.hidden` (audit §13 recommendation)

**Action:** `src/lib/hooks/page/useGameTickLoop.ts`

**After:**
```ts
useEffect(() => {
  const interval = Math.max(50, 1000 / effectiveSpeed);
  if (tickRef.current) clearInterval(tickRef.current);
  if (paused || document.hidden) return;
  tickRef.current = setInterval(() => {
    if (document.hidden) return; // belt + suspenders
    useGameStore.getState().gameTickAction();
  }, interval);
  return () => {
    if (tickRef.current) clearInterval(tickRef.current);
  };
}, [effectiveSpeed, paused]);

useEffect(() => {
  const onVis = () => {
    // Re-run the main effect by toggling `paused` (or use a ref)
  };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}, []);
```

(Implementation: use a `documentHiddenRef` that the main effect reads; the visibilitychange listener flips it.)

**Validation:** Background tab in DevTools → tick counter stops moving. Foreground tab → it resumes.

---

## Phase 4 — Accessibility & Responsive (Day 6–7, 6–8 hours)

### 4.1 Pause control on the (replaced) ticker (BUG-015 — already covered by 1.8)

### 4.2 Add `aria-label` to all icon-only buttons (BUG-018)

**Action:** Run `eslint-plugin-jsx-a11y` and fix every report.

**Steps:**
1. Add `eslint-plugin-jsx-a11y` to devDependencies.
2. Enable `recommended` ruleset in `eslint.config.mjs`.
3. Run `npm run lint`; fix each reported `jsx-a11y/control-has-associated-label`, `jsx-a11y/aria-role`, etc.
4. For each unlabeled icon button, add `aria-label` from the action context.

### 4.3 Tablet breakpoint (BUG-019)

**Action:** Define and apply `md:` layouts to all panels.

**Steps:**
1. Audit each panel at 768px width using a browser dev tools.
2. Define tablet grid columns (typically 2-col on tablet, 3-col on desktop).
3. For `GameSidebar` at tablet: collapse to icons-only.
4. For `BottomNavigationBar` at tablet: keep full bottom-nav.
5. For `page.tsx` main content: add `md:` grid layouts.

**Validation:** Open the app at 768px, 800px, 1000px, 1024px in browser dev tools. Layout should adapt, not just snap.

### 4.4 Raise typography floor (BUG-021)

**Action:** For each `text-[Npx]` with N < 11 used in informational content, raise to 11px.

**Approach:**
1. Inventory: which classes are decorative (badges, count chips) vs informational (labels, captions)?
2. For informational: `text-[8px]` → `text-[11px]`, etc.
3. For decorative: keep but document in a comment per component.
4. Add a new Tailwind utility `text-2xs` = 10px for explicit decorative sizing.

### 4.5 Verify `text-muted-label` contrast (BUG-022)

**Action:**
1. Use `axe-core` or `polypane` to measure contrast at the 10 most-used contexts (sidebar nav, header meta, table captions, etc.).
2. If any fail 4.5:1:
   - Bump `--color-muted-label` to `#cbd5e1` (slate-300), OR
   - Add `--color-muted-label-strong` for high-priority muted text.
3. Document the token usage rules in `globals.css` comments.

---

## Phase 5 — Verification (Day 8, 2–3 hours)

### 5.1 Re-run the audit (qualitative)

Open the app at:
- 375px (mobile)
- 768px (tablet)
- 1024px (small desktop)
- 1440px (large desktop)

For each, check:
- No raw `bg-[#…]` visible
- All interactive elements have visible focus rings
- Screen reader (VoiceOver / NVDA) reads active tab as "current page"
- Tabs other than Dashboard load via lazy chunk
- No console errors, no console.log output in production

### 5.2 Run `axe-core` in CI

```sh
npx @axe-core/cli http://localhost:3000/ --exit
```

Should pass with 0 violations of severity "serious" or "critical".

### 5.3 Bundle size check

```sh
npm run build
# Inspect .next/analyze or use @next/bundle-analyzer
```

Expected: initial JS bundle < 300KB gzipped (current: ~600KB estimate).

### 5.4 Update `PROJECT_STATUS_SOURCE_OF_TRUTH.md`

Add a section noting the audit remediation is complete, link to this plan, and update the platform quality score.

---

## Validation Plan

Each phase has its own validation. Cross-cutting validation:

| Check | Tool | Pass criterion |
|---|---|---|
| Lint | `npm run lint` | 0 errors |
| Type check | `npx tsc --noEmit` | 0 errors |
| Build | `npm run build` | Success, bundle size reduced |
| A11y | `axe-core` on `/` | 0 serious/critical violations |
| Visual | Manual at 4 breakpoints | Layout adapts cleanly |
| Performance | Lighthouse (mobile, slow 4G) | LCP < 2.5s, TBT < 200ms |
| Code quality | `grep` for forbidden patterns | 0 matches |

## Regression Tests

There are no automated tests currently (BUG-004). For each phase:

- **Phase 1**: Manual smoke test of every panel after each change.
- **Phase 2**: Visual diff per panel (before/after screenshots via Playwright).
- **Phase 3**: Lighthouse before/after; ensure Lighthouse on `/` improves.
- **Phase 4**: Run `axe-core` on each panel; keyboard-only navigation test (tab through all interactive elements).
- **Phase 5**: Full re-audit.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Codemod breaks visual | Med | Med | One panel at a time, visual review, git revert if needed |
| `next/dynamic` causes hydration mismatch | Med | Med | Use `ssr: false` where needed; test each panel in isolation |
| `next/image` remotePatterns misconfig | Low | Low | Test with real avatar URLs; document config |
| Focus ring change breaks existing a11y | Low | Low | Verify with keyboard nav after each change |
| Bundle analysis shows smaller-than-expected win | Low | Low | Acceptable — even 20% reduction is valuable |

## Success Criteria

- All 17 confirmed bugs marked `Resolved` in `BUGS.md`.
- `BUGS.md` summary table updated.
- `PROJECT_STATUS_SOURCE_OF_TRUTH.md` references this plan as completed.
- Platform quality score (re-run the original audit) ≥ 90/100.
- Zero new raw hex colors in code (CI gate enforces).
- Bundle size reduced by ≥ 40%.
- `axe-core` reports 0 serious/critical a11y violations.

---

**Status:** Phases 1–4 executed (2026-06-17, see `BUGS.md` resolution log: BUG-014, 015, 016, 017, 020, 021, 023, 024, 026, 027, 028, 029, 030). **Phase 5 (Verification) and partial items (BUG-017 hex residue, BUG-018 admin sweep, BUG-019 remaining panels, BUG-025 typography) remain.**
**Owner:** TBD (per AGENT.md, the agent that executes must read this plan and BUGS.md first).
**Last updated:** 2026-06-17 (status updated)
