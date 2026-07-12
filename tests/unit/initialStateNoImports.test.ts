/**
 * Initial State Server-Side Architecture Guard
 *
 * Phase 12 (2026-07-10) deletes `src/lib/game/constants/initialState.ts`
 * because the canonical GameState shape is now server-authoritative
 * (`src/lib/db/initialState.server.ts` + `fetchCanonicalInitialState()`).
 *
 * Any code that re-imports `createInitialState`, `initialResources`, or
 * `initialCapacity` is a regression — it would mean client-side state
 * initialization is happening again, which is the data-loss bug we just
 * fixed.
 *
 * Allowed locations:
 *   - src/lib/db/initialState.server.ts        (the server helper itself,
 *     where comments mention the old client shape for historical context)
 *   - src/lib/game/state/store-actions/prestige.ts (historical comment about
 *     the old pattern that was removed; the comment is informational only)
 *   - src/lib/game/production/engine/serverEngine.ts (historical comment in
 *     validatePrestigeAction docstring)
 *   - tests/unit/initialStateNoImports.test.ts (this file — references
 *     itself in ignore list)
 *
 * This test fails the build if any non-allowed file references the old
 * client-side initial-state symbols.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC_DIR = join(process.cwd(), 'src');
const GAME_DIR = join(SRC_DIR, 'lib', 'game');
const DB_DIR = join(SRC_DIR, 'lib', 'db');
const COMPONENTS_DIR = join(SRC_DIR, 'components');
const TESTS_DIR = join(process.cwd(), 'tests');

// Files legitimately allowed to mention the deleted symbols.
const ALLOWED_FILES = new Set<string>([
  // The server helper itself — historical context in docblock.
  'src/lib/db/initialState.server.ts',
  // Phase 12 removal notes in client-side code (informational comments only).
  'src/lib/game/state/store-actions/prestige.ts',
  'src/lib/game/production/engine/serverEngine.ts',
  // This guard.
  'tests/unit/initialStateNoImports.test.ts',
]);

const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  {
    name: 'createInitialState',
    regex: /\bcreateInitialState\b/,
  },
  {
    name: 'initialResources import',
    regex: /from\s+["'][^"']*constants\/initialState[^"']*["']/,
  },
  {
    name: 'initialCapacity import',
    regex: /from\s+["'][^"']*constants\/initialState[^"']*["']/,
  },
  {
    name: '"named-import" of initialResources/initialCapacity',
    regex: /\{\s*[a-zA-Z_,\s]*?(initialResources|initialCapacity)[a-zA-Z_,\s]*?\}\s*from\s+["'][^"']*initialState[^"']*["']/,
  },
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

function toProjectRel(absolute: string): string {
  const cwd = process.cwd().replace(/[\\/]+/g, '/');
  return absolute.replace(/[\\/]+/g, '/').replace(cwd + '/', '');
}

describe('Phase 12 — Initial State Server-Side', () => {
  describe('no client-side initialState references', () => {
    const dirsToScan: string[] = [
      ...walk(GAME_DIR),
      ...walk(DB_DIR),
      ...walk(COMPONENTS_DIR),
    ];
    const OFFENDERS: Array<{ file: string; line: number; pattern: string; text: string }> = [];

    for (const file of dirsToScan) {
      const rel = toProjectRel(file);
      if (ALLOWED_FILES.has(rel)) continue;
      const lines = readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const { name, regex } of FORBIDDEN_PATTERNS) {
          if (regex.test(lines[i])) {
            OFFENDERS.push({ file: rel, line: i + 1, pattern: name, text: lines[i].trim() });
          }
        }
      }
    }

    it('does not import from constants/initialState in client code', () => {
      if (OFFENDERS.length > 0) {
        const msg = OFFENDERS.map(o =>
          `  ${o.file}:${o.line} [${o.pattern}] → ${o.text}`,
        ).join('\n');
        throw new Error(
          `Phase 12 guard: client code references the deleted client-side initialState shape. ` +
          `Use fetchCanonicalInitialState() from '@/lib/db/initialState.server' instead.\n${msg}`,
        );
      }
      expect(OFFENDERS).toEqual([]);
    });
  });

  describe('constants/initialState.ts is removed', () => {
    it('file does not exist', () => {
      const target = join(GAME_DIR, 'constants', 'initialState.ts');
      expect(() => statSync(target)).toThrow();
    });
  });
});
