/**
 * Autonoma test-data — per-run ID derivation.
 *
 * The SDK hands every `up` request a `testRunId` (uuid) and substitutes
 * `{{testRunId}}` and `{{testRunShortId}}` into recipe values before
 * posting them. Two simultaneous runs would otherwise collide on unique
 * constraints. We derive stable, run-unique values from those tokens
 * here so factories can mint surrogate PKs that:
 *   - look real (no random gibberish beyond the token suffix),
 *   - are unique per run (carry the short id),
 *   - survive the round-trip without re-substitution.
 *
 * Tables where the PK is text (every `game_config_*`) get a short
 * run-scoped prefix so the value still reads as a real id.
 * Tables where the PK is uuid get an RFC-4122-shaped string built from
 * the short hash so UUID-column inserts don't fail type-validation.
 */

import { createHash } from "node:crypto";

/** Short, URL-safe hash of a test run id. Matches the SDK's
 *  {{testRunShortId}} substitution so values line up with what the
 *  platform records as the run's "short id". */
export function shortIdFor(testRunId: string): string {
  return createHash("sha256").update(testRunId).digest("hex").slice(0, 8);
}

/** Stable UUID-shaped string derived from the run id. The SDK's
 *  `{{testRunShortId}}` is only 8 chars; we pad deterministically with
 *  the run id's sha256 so every PK is unique across runs but reproducible
 *  within one run (factory ↔ teardown match). */
export function uuidFor(testRunId: string, label: string): string {
  // Deterministic, no Math.random (SEC-008).
  const hash = createHash("sha256")
    .update(`${testRunId}:${label}`)
    .digest("hex");
  // Format as RFC-4122 v5-ish: 8-4-4-4-12. Variant/version nibbles set
  // so it round-trips through Supabase's uuid type.
  const h = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return h;
}

/** Text PK helper. Keeps the value readable (semantic prefix + short id
 *  suffix) so seeded config rows don't look like machine noise. */
export function textIdFor(testRunId: string, prefix: string): string {
  return `${prefix}-${shortIdFor(testRunId)}`;
}

/** Composite key suffix for tables whose natural key is a tuple — used
 *  by the recipe to keep things unique per run when the SDK can't tokenize
 *  a single column by itself. Returns a short hash of the supplied inputs. */
export function compositeKeyFor(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 12);
}