/**
 * tests/unit/c-009-pause-ui-removed.test.ts
 *
 * C-009 (BUILDING_PRODUCTION_AUDIT §10.6 P1, 2026-07-16):
 *   The `togglePause` store action was client-only — the server tick
 *   runner (`runServerTicks`) ignored `state.paused`, so toggling it
 *   flipped local state but resources kept advancing on the server.
 *   The Space-key shortcut and the header button gave players a false
 *   sense of control.
 *
 *   Product decision (2026-07-16): remove the pause UI entirely. The
 *   `paused` field stays in the state for backward compatibility but is
 *   never set to `true`. Future product can reintroduce a
 *   server-authoritative pause.
 *
 * This test asserts:
 *   1. `togglePause` is no longer in the store type.
 *   2. Neither header has a pause button.
 *   3. The keyboard shortcut handler does not bind Space to pause.
 *   4. The heartbeat payload does not carry a `paused` field.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function readSource(relPath: string): string {
  return readFileSync(join(SRC, relPath), "utf8");
}

describe("C-009 — pause UI removed (client-only toggle was misleading)", () => {
  it("store type no longer declares togglePause", () => {
    const content = readSource("lib/game/state/store-types.ts");
    expect(content).not.toMatch(/togglePause\s*:\s*\(/);
  });

  it("core actions no longer implement togglePause", () => {
    const content = readSource("lib/game/state/store-actions/core.ts");
    expect(content).not.toMatch(/togglePause\s*:/);
    expect(content).not.toMatch(/set\([^)]*paused/);
  });

  it("DesktopHeader has no pause button", () => {
    const content = readSource("components/game/headers/DesktopHeader.tsx");
    expect(content).not.toMatch(/togglePause\s*\(/);
    expect(content).not.toMatch(/paused\s*\?\s*["']Resume/);
    expect(content).not.toMatch(/aria-label=\{paused/);
  });

  it("MobileHeader has no pause selector or button", () => {
    const content = readSource("components/game/headers/MobileHeader.tsx");
    expect(content).not.toMatch(/s\.paused/);
    expect(content).not.toMatch(/togglePause\s*\(/);
    expect(content).not.toMatch(/aria-label=\{paused/);
  });

  it("useKeyboardShortcuts does not bind Space to pause", () => {
    const content = readSource("lib/hooks/page/useKeyboardShortcuts.ts");
    // No Space-key handler should remain. The original code used
    // `e.key === ' '` (Space character). No `togglePause()` call.
    expect(content).not.toMatch(/e\.key\s*===\s*["']\s*["']/);
    // `togglePause()` is only referenced in the C-009 comment; strip
    // line comments before matching the regex.
    const codeOnly = content
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    expect(codeOnly).not.toMatch(/togglePause\s*\(\)/);
  });

  it("useSessionHeartbeat payload omits paused", () => {
    const content = readSource("lib/hooks/page/useSessionHeartbeat.ts");
    expect(content).not.toMatch(/paused:/);
  });
});
