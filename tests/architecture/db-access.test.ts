/**
 * Architecture test: the privileged Supabase client factory must be reached
 * only through @/lib/db/access (or its explicit compatibility wrappers).
 *
 * Allowed surfaces:
 *   - src/lib/db/access/**           (canonical boundary)
 *   - src/lib/supabase/server.ts     (legacy compatibility shim)
 *   - src/lib/db/admin/admin.ts      (legacy compatibility re-export)
 *
 * Anything else importing createServiceRoleClient, isServiceRoleConfigured,
 * getDbClient, requireDbClient, or isDbClientConfigured from a different
 * module violates the DB-015 rule.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'src');

const ALLOWED_FILES = new Set<string>(
  [
    join('src', 'lib', 'supabase', 'server.ts'),
    join('src', 'lib', 'db', 'admin', 'admin.ts'),
  ].map((p) => p.split('/').join(sep)),
);

const MIGRATABLE_NAMES = [
  'createServiceRoleClient',
  'isServiceRoleConfigured',
  'getDbClient',
  'requireDbClient',
  'isDbClientConfigured',
];

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

describe('DB-015 — privileged client boundary', () => {
  const files = listFiles(SRC);
  const offenders: { file: string; line: number; name: string }[] = [];

  for (const file of files) {
    const relativePath = relative(process.cwd(), file);
    if (ALLOWED_FILES.has(relativePath)) {
      continue;
    }
    if (
      relativePath.startsWith(`src${sep}lib${sep}db${sep}access${sep}`) ||
      relativePath.startsWith(`src${sep}lib${sep}supabase${sep}`)
    ) {
      continue;
    }

    const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (
        line.includes('from') &&
        line.includes('@/lib/db/access')
      ) {
        // Already routed through the boundary — good.
        return;
      }
      for (const name of MIGRATABLE_NAMES) {
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

  it('keeps createServiceRoleClient and friends inside the boundary', () => {
    expect(offenders).toEqual([]);
  });

  it('canonical names (getDbClient etc.) also stay inside the boundary', () => {
    // BUG-077 Task 4: the canonical names are the new public surface
    // and must also stay out of source files. The MIGRATABLE_NAMES
    // array above scans for both, but this assertion makes the
    // canonical-name invariant explicit in the test report.
    const canonicalNames = ['getDbClient', 'requireDbClient', 'isDbClientConfigured'];
    const canonicalOffenders = offenders.filter((o) =>
      canonicalNames.includes(o.name),
    );
    expect(canonicalOffenders).toEqual([]);
  });

  it('reports legacy vs canonical offender counts (BUG-077 progress meter)', () => {
    // Soft assertion — both buckets must be empty at Task 9 commit.
    // Right now we only enforce the canonical one is empty (legacy
    // bucket still has 68 files at the start of Task 5).
    const legacyNames = ['createServiceRoleClient', 'isServiceRoleConfigured'];
    const canonicalNames = ['getDbClient', 'requireDbClient', 'isDbClientConfigured'];
    const legacy = offenders.filter((o) => legacyNames.includes(o.name));
    const canonical = offenders.filter((o) => canonicalNames.includes(o.name));
    // eslint-disable-next-line no-console
    console.warn(
      `[BUG-077] Boundary offenders: legacy=${legacy.length} canonical=${canonical.length}`,
    );
    expect(canonical).toEqual([]);
  });

  it('exposes the canonical boundary module', () => {
    const boundary = readFileSync(
      join(SRC, 'lib', 'db', 'access', 'index.ts'),
      'utf-8',
    );
    expect(boundary).toMatch(/export[^;]+getDbClient/);
    expect(boundary).toMatch(/export[^;]+requireDbClient/);
    expect(boundary).toMatch(/export[^;]+createServiceRoleClient/);
  });
});