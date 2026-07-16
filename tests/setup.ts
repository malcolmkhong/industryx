// tests/setup.ts
// Vitest setup — runs before every test file.
//
// Required env vars to import game state validator and other
// fail-closed modules without throwing at module-evaluation time.
//
// Balance fixture: production code throws BalanceNotLoadedError when
// `getBalance()` is called before `applyBalanceOverrides()` (RULES.md
// [SEC-002]). Pre-load a complete default balance here so any test
// that hits a `getBalance()` path (validators, production math,
// runtime calculations) doesn't need to re-set it up per file.

import { applyBalanceOverrides } from "@/lib/game/config/balance/balanceConfig";
import { DEFAULT_TEST_BALANCE } from "./fixtures/defaultBalance";

process.env.CHECKSUM_SECRET ??= "test-checksum-secret-not-real-just-for-vitest";
// Matches production so cookie name parsing in unit tests matches real shape.
// Project ref is the first label of the hostname, used in cookie names
// like sb-{ref}-auth-token.
process.env.NEXT_PUBLIC_SUPABASE_URL ??=
  "https://wkkzqtseqwcyyyezroqq.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

applyBalanceOverrides(DEFAULT_TEST_BALANCE);
