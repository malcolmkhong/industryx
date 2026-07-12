import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("FingerprintUnavailableModal markup", () => {
  it("does not nest block content inside DialogDescription", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/components/auth/FingerprintUnavailableModal.tsx",
      ),
      "utf8",
    );

    const descriptionBlocks = src.match(
      /<DialogDescription\b[\s\S]*?<\/DialogDescription>/g,
    );

    expect(descriptionBlocks).not.toBeNull();
    for (const block of descriptionBlocks ?? []) {
      expect(block).not.toMatch(/<(p|ol|ul|div|section|article)\b/);
    }
  });
});
