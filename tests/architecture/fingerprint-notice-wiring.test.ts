import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("fingerprint status ownership", () => {
  it("uses AuthProvider's bootstrap orchestrator for the ready-only notice", () => {
    const source = readSource("src/components/providers/AuthProvider.tsx");

    expect(source).toContain(
      '@/components/game/auth/FingerprintStatusNotice',
    );
    expect(source).toMatch(/orchestratorState\.status\s*===\s*["']ready["']/);
    expect(source).toMatch(/orchestratorState\.fingerprintStatus/);
    expect(source).toMatch(/FingerprintStatusNotice/);
  });

  it("does not create a second root-level orchestrator for the retired modal", () => {
    const source = readSource("src/app/layout.tsx");

    expect(source).not.toContain("AuthOrchestratorProvider");
    expect(source).not.toContain("FingerprintUnavailableModal");
  });
});
