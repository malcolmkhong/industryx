#!/usr/bin/env bash
# CI Gates — Prevent design-system regressions.
# Source: planning/CI_GATES.md
# This script is invoked in CI (Vercel build step) or as a pre-commit hook.
# It compares the current working tree against origin/main and fails if any
# banned pattern was introduced.

set -e

# Allow override of base branch
BASE="${1:-origin/main}"

echo "Running design-system CI gates against ${BASE}..."

# Make sure we have a diff to compare
if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  echo "⚠️  Base ${BASE} not found locally; running against HEAD~1 instead."
  BASE="HEAD~1"
fi

# Capture the diff once
DIFF=$(git diff "$BASE"...HEAD -- src/ 2>/dev/null || git diff "$BASE" -- src/ 2>/dev/null || true)
STAGED=$(git diff --cached -- src/ 2>/dev/null || true)
ALL_DIFF="${DIFF}${STAGED}"

fail() {
  echo ""
  echo "❌ $1"
  echo "$2"
  echo "See planning/CI_GATES.md for details."
  exit 1
}

# 1. Block new raw hex background/text colors
if echo "$ALL_DIFF" | grep -E '^\+.*(bg|text)-\[#[0-9a-fA-F]' >/dev/null 2>&1; then
  fail "raw hex bg/text color introduced" "$(echo "$ALL_DIFF" | grep -E '^\+.*(bg|text)-\[#[0-9a-fA-F]')"
fi

# 2. Block raw palette for status / semantic meaning
if echo "$ALL_DIFF" | grep -E '^\+.*(bg|text|border|ring)-(red|emerald|amber|yellow|fuchsia|violet|orange|pink|rose|indigo|sky|teal|cyan|blue|purple|lime|green)-[0-9]+' >/dev/null 2>&1; then
  fail "raw palette for status color introduced" "$(echo "$ALL_DIFF" | grep -E '^\+.*(bg|text|border|ring)-(red|emerald|amber|yellow|fuchsia|violet|orange|pink|rose|indigo|sky|teal|cyan|blue|purple|lime|green)-[0-9]+')"
fi

# 3. Block hardcoded dark bg
if echo "$ALL_DIFF" | grep -E '^\+.*bg-\[#0a0e17\]' >/dev/null 2>&1; then
  fail "raw dark-bg hex introduced" "$(echo "$ALL_DIFF" | grep -E '^\+.*bg-\[#0a0e17\]')"
fi

# 4. Block cyan focus rings
if echo "$ALL_DIFF" | grep -E '^\+.*focus-visible:ring-cyan' >/dev/null 2>&1; then
  fail "cyan focus ring introduced" "$(echo "$ALL_DIFF" | grep -E '^\+.*focus-visible:ring-cyan')"
fi

# 5. Block useGameStore() without selector (per AGENT.md forbidden patterns)
# Matches `useGameStore()` but NOT `useGameStore((s) => ...)` or `useGameStore.getState()`
if echo "$ALL_DIFF" | grep -E '^\+.*\buseGameStore\(\)' >/dev/null 2>&1; then
  fail "useGameStore() without selector introduced (per AGENT.md forbidden patterns)" "$(echo "$ALL_DIFF" | grep -E '^\+.*\buseGameStore\(\)')"
fi

echo "✅ All design-system gates passed."
