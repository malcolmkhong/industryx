/**
 * Architecture test: the privileged Supabase client factory must be reached
 * only through @/lib/db/access (the canonical boundary).
 *
 * Allowed surfaces:
 *   - src/lib/db/access/**           (canonical boundary)
 *
 * Anything else importing createServiceRoleClient, isServiceRoleConfigured,
 * getDbClient, requireDbClient, or isDbClientConfigured from a different
 * module violates the DB-015 rule.
 *
 * BUG-077 Task 9: the legacy compat shims (src/lib/supabase/server.ts and
 * src/lib/db/admin/admin.ts) were deleted. The only place the legacy
 * names exist now is in the boundary module's own doc comments (as
 * historical reference), which the ALLOWED_FILES list exempts.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(process.cwd(), "src");

const ALLOWED_FILES = new Set<string>(
  // The boundary module itself, which may contain historical references
  // to the legacy names in doc comments. No call site lives in these
  // files.
  [
    join("src", "lib", "db", "access", "index.ts"),
    join("src", "lib", "db", "access", "getDbClient.server.ts"),
  ].map((p) => p.split("/").join(sep)),
);

const CANONICAL_NAMES = [
  "getDbClient",
  "requireDbClient",
  "isDbClientConfigured",
];

const LEGACY_NAMES = ["createServiceRoleClient", "isServiceRoleConfigured"];

const ALL_NAMES = [...CANONICAL_NAMES, ...LEGACY_NAMES];

function listFiles(root: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...listFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

describe("DB-015 — privileged client boundary", () => {
  const files = listFiles(SRC);
  const offenders: { file: string; line: number; name: string }[] = [];

  for (const file of files) {
    const relativePath = relative(process.cwd(), file);
    if (ALLOWED_FILES.has(relativePath)) {
      continue;
    }
    if (relativePath.startsWith(`src${sep}lib${sep}db${sep}access${sep}`)) {
      continue;
    }

    const lines = readFileSync(file, "utf-8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes("from") && line.includes("@/lib/db/access")) {
        // Already routed through the boundary — good.
        return;
      }
      for (const name of ALL_NAMES) {
        if (line.includes(`\\b${name}\\b`)) {
          offenders.push({
            file: relativePath,
            line: index + 1,
            name,
          });
        }
      }
    });
  }

  it("keeps all privileged-client names inside the boundary", () => {
    // After Task 9: both legacy and canonical names are forbidden
    // outside the boundary. Empty array here means 0 violations.
    expect(offenders).toEqual([]);
  });

  it("reports legacy vs canonical offender counts (BUG-077 progress meter)", () => {
    const legacy = offenders.filter((o) => LEGACY_NAMES.includes(o.name));
    const canonical = offenders.filter((o) => CANONICAL_NAMES.includes(o.name));
    // eslint-disable-next-line no-console
    console.warn(
      `[BUG-077] Boundary offenders: legacy=${legacy.length} canonical=${canonical.length}`,
    );
    // Task 9 target: both buckets = 0.
    expect(legacy).toEqual([]);
    expect(canonical).toEqual([]);
  });

  it("exposes only canonical names on the boundary module", () => {
    const boundary = readFileSync(
      join(SRC, "lib", "db", "access", "index.ts"),
      "utf-8",
    );
    // Canonical surface (BUG-077 Task 8/9). The export statement
    // spans multiple lines so we look for the export block and the
    // individual names anywhere inside the re-export expression.
    expect(boundary).toMatch(/export\s*\{[\s\S]*?getDbClient[\s\S]*?\}\s*from/);
    expect(boundary).toMatch(
      /export\s*\{[\s\S]*?requireDbClient[\s\S]*?\}\s*from/,
    );
    expect(boundary).toMatch(
      /export\s*\{[\s\S]*?isDbClientConfigured[\s\S]*?\}\s*from/,
    );
    // Legacy aliases must NOT be re-exported (Task 9).
    expect(boundary).not.toMatch(/export\s*\{[\s\S]*?createServiceRoleClient/);
    expect(boundary).not.toMatch(/export\s*\{[\s\S]*?isServiceRoleConfigured/);
  });
});
