#!/usr/bin/env bash
# CI Gates — Prevent design-system regressions.
# Source: planning/CI_GATES.md
# This script is invoked in CI (Vercel build step) or as a pre-commit hook.
# It compares the current working tree against origin/main and fails if any
# banned pattern was introduced in the diff.
#
# v2 — derived from quality-baseline audit (2026-08):
#   88% of files in src/ already follow the design system. The 12% that
#   don't (concentrated in app/admin/**) are pre-existing violations. The
#   script only checks lines being added (^\+) so it doesn't fail the
#   build for old code — but it WILL fail any PR that introduces a new
#   raw hex / raw white / raw palette value.
#
# Rollout: "hard launch" — script is enabled and exit 1 on violation.
# Migrate the pre-existing 340+ violations in follow-up PRs.

set -e

# Allow override of base branch
BASE="${1:-origin/main}"

echo "Running design-system CI gates against ${BASE}..."

# Make sure we have a diff to compare
if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  echo "⚠️  Base ${BASE} not found locally; running against HEAD~1 instead."
  BASE="HEAD~1"
fi

# Capture the diff once. Only check NEW lines (^\+), not existing code.
DIFF=$(git diff "$BASE"...HEAD -- src/ 2>/dev/null || git diff "$BASE" -- src/ 2>/dev/null || true)
STAGED=$(git diff --cached -- src/ 2>/dev/null || true)
ALL_DIFF="${DIFF}${STAGED}"

fail() {
  echo ""
  echo "❌ $1"
  echo ""
  echo "Offending lines:"
  echo "$2" | head -20
  echo ""
  echo "Use semantic tokens instead. See planning/CI_GATES.md for the catalog."
  echo "Quick reference:"
  echo "  text-white  -> text-foreground   (primary text on dark bg)"
  echo "  text-white/80 -> text-muted-label (secondary text on dark bg)"
  echo "  bg-[#0a0a0a]/[#0d1220] -> bg-background   (dark theme background)"
  echo "  bg-[#111827] -> bg-industrial-card"
  echo "  bg-[#1a1525] -> bg-card (or bg-muted)"
  echo "  bg-red-500 / bg-emerald-500 / bg-amber-500 -> bg-danger / bg-success / bg-warning"
  exit 1
}

# 1. Block new raw hex in any utility class
#    (bg-[#hex], text-[#hex], border-[#hex], ring-[#hex], shadow-[#hex], fill-[#hex], stroke-[#hex])
RAW_HEX=$(echo "$ALL_DIFF" | grep -E '^\+.*\b(bg|text|border|ring|shadow|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]' || true)
if [ -n "$RAW_HEX" ]; then
  fail "raw hex color introduced (use semantic tokens)" "$RAW_HEX"
fi

# 2. Block raw white/black/white-X/black-X in any utility
#    On a dark theme, text-white and text-black break theming and accessibility.
RAW_WHITE=$(echo "$ALL_DIFF" | grep -E '^\+.*\b(bg|text|border|ring|fill|stroke)-(white|black)(-[0-9]+)?\b' || true)
if [ -n "$RAW_WHITE" ]; then
  fail "raw white/black color introduced (use text-foreground / text-muted-label)" "$RAW_WHITE"
fi

# 3. Block raw Tailwind palette for status / semantic meaning
#    See src/app/globals.css for the semantic token catalog.
RAW_PALETTE=$(echo "$ALL_DIFF" | grep -E '^\+.*\b(bg|text|border|ring)-(red|emerald|amber|yellow|fuchsia|violet|orange|pink|rose|indigo|sky|teal|cyan|blue|purple|lime|green)-[0-9]+' || true)
if [ -n "$RAW_PALETTE" ]; then
  fail "raw Tailwind palette for status color introduced" "$RAW_PALETTE"
fi

# 4. Block the specific hardcoded dark-bg hex (defense in depth — rule 1
#    should already catch this, but pin the exact value for clarity)
RAW_DARK_BG=$(echo "$ALL_DIFF" | grep -E '^\+.*\bbg-\[#0a0e17\]' || true)
if [ -n "$RAW_DARK_BG" ]; then
  fail "raw dark-bg hex introduced (use bg-background)" "$RAW_DARK_BG"
fi

# 5. Block cyan focus rings (use the brand token)
RAW_CYAN_FOCUS=$(echo "$ALL_DIFF" | grep -E '^\+.*focus-visible:ring-cyan' || true)
if [ -n "$RAW_CYAN_FOCUS" ]; then
  fail "cyan focus ring introduced (use focus-visible:ring-brand)" "$RAW_CYAN_FOCUS"
fi

# 6. Block useGameStore() without selector (per AGENT.md forbidden patterns)
#    Matches `useGameStore()` but NOT `useGameStore((s) => ...)` or
#    `useGameStore.getState()`.
RAW_ZUSTAND=$(echo "$ALL_DIFF" | grep -E '^\+.*\buseGameStore\(\)' || true)
if [ -n "$RAW_ZUSTAND" ]; then
  fail "useGameStore() without selector introduced" "$RAW_ZUSTAND"
fi

echo "✅ All design-system gates passed."
