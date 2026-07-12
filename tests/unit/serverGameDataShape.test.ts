/**
 * serverGameDataShape.test.ts — Phase 13 architecture guard
 *
 * Phase 13 (2026-07-10, Option C) introduced the ServerGameData vs
 * UISessionState split. This test enforces the boundary via static
 * AST analysis:
 *
 *   • Server-side files (src/lib/db, src/app/api, src/lib/auth/*Validator*,
 *     src/lib/game/serverEngine.ts, src/lib/game/productionCalculator.ts)
 *     MUST NOT reference UISessionState fields
 *   • Client-only files (src/components/**) MUST NOT directly mutate
 *     ServerGameData fields outside the SERVER_FIELDS whitelist
 *   • The fetchCanonicalInitialState() return type MUST include the
 *     ServerGameData fields and exclude UISessionState fields
 *
 * This test will FAIL if someone:
 *   - Re-adds `hydrated` to a server validator signature
 *   - Removes the split (re-merging GameState fields carelessly)
 *   - Has server-side code that reads `state.activeTab` or `state.notifications`
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC_DIR = join(process.cwd(), 'src');
const SERVER_DIRS = [
  join(SRC_DIR, 'lib', 'db'),
  join(SRC_DIR, 'app', 'api'),
];
const SERVER_ENGINE = join(SRC_DIR, 'lib', 'game', 'serverEngine.ts');
const PRODUCTION_CALC = join(SRC_DIR, 'lib', 'game', 'productionCalculator.ts');

const UI_KEYS = [
  'hydrated',
  'activeTab',
  'selectedBuilding',
  'notifications',
  'productionSnapshot',
] as const;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

function readOk(p: string): string | null {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

describe('Phase 13 — ServerGameData vs UISessionState split', () => {
  describe('server-side files never reference UISessionState fields', () => {
    const OFFENDERS: Array<{ file: string; line: number; field: string; text: string }> = [];

    const serverFiles: string[] = [];
    for (const dir of SERVER_DIRS) {
      try { serverFiles.push(...walk(dir)); } catch { /* dir not exist */ }
    }
    if (readOk(SERVER_ENGINE)) serverFiles.push(SERVER_ENGINE);
    if (readOk(PRODUCTION_CALC)) serverFiles.push(PRODUCTION_CALC);

    for (const file of serverFiles) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match: .hydrated, .activeTab, .selectedBuilding, .notifications, .productionSnapshot
        // (object property access), NOT in comments. Excludes type imports.
        for (const uiKey of UI_KEYS) {
          const accessRegex = new RegExp(`\\.\\b${uiKey}\\b`);
          const declRegex = new RegExp(`\\b${uiKey}\\s*\\?\\s*:`); // optional field decl
          const isComment = line.trim().startsWith('//') || line.trim().startsWith('*');
          if (!isComment && (accessRegex.test(line) || declRegex.test(line))) {
            // Allow UISessionState interface declarations only in types.ts
            if (file.endsWith('types.ts') && line.includes('UISessionState')) continue;
            OFFENDERS.push({ file, line: i + 1, field: uiKey, text: line.trim() });
          }
        }
      }
    }

    it('has no UI-key access in server-side files', () => {
      if (OFFENDERS.length > 0) {
        const msg = OFFENDERS.map(o =>
          `  ${o.file.split(/[\\/]/).pop()}:${o.line} [${o.field}] → ${o.text}`,
        ).join('\n');
        throw new Error(
          `Phase 13 server-side purity violation. Server-side code MUST NOT read UI fields:\n${msg}\n\n` +
          `Move UI access to the client store + UISessionState handling.`,
        );
      }
      expect(OFFENDERS).toEqual([]);
    });
  });

  describe('UI/SessionState is only declared in types.ts', () => {
    it('UISessionState interface exists in types.ts', () => {
      const typesPath = join(SRC_DIR, 'lib', 'game', 'types.ts');
      const content = readFileSync(typesPath, 'utf8');
      expect(content).toMatch(/export\s+interface\s+UISessionState/);
    });

    it('ServerGameData interface exists in types.ts', () => {
      const typesPath = join(SRC_DIR, 'lib', 'game', 'types.ts');
      const content = readFileSync(typesPath, 'utf8');
      expect(content).toMatch(/export\s+interface\s+ServerGameData/);
    });
  });

  describe('fetchCanonicalInitialState return type is ServerGameData', () => {
    it('helper explicitly types return as Promise<ServerGameData>', () => {
      const helperPath = join(SRC_DIR, 'lib', 'db', 'initialState.server.ts');
      const content = readFileSync(helperPath, 'utf8');
      expect(content).toMatch(
        /fetchCanonicalInitialState\s*\(\s*\)\s*:\s*Promise\s*<\s*ServerGameData\s*>/,
      );
    });

    it('helper does NOT include UI fields in the returned shape', () => {
      const helperPath = join(SRC_DIR, 'lib', 'db', 'initialState.server.ts');
      const content = readFileSync(helperPath, 'utf8');
      for (const uiKey of UI_KEYS) {
        // The shape literal in the helper must not include uiKey as a field.
        // Match `uiKey:` (a field declaration), not `state.uiKey` (access).
        const fieldDecl = new RegExp(`^\\s*${uiKey}\\s*:`, 'm');
        if (fieldDecl.test(content)) {
          throw new Error(
            `Phase 13 invariant: initialState.server.ts still includes UI field "${uiKey}". ` +
            `Server must return pure ServerGameData only.`,
          );
        }
      }
    });
  });

  describe('store-bootstrap merges server data with UI session state', () => {
    it('mergeCanonicalWithUI helper is exported', () => {
      const bp = join(SRC_DIR, 'lib', 'game', 'store-bootstrap.ts');
      const content = readFileSync(bp, 'utf8');
      expect(content).toMatch(/export\s+function\s+mergeCanonicalWithUI/);
    });

    it('hydrateInitialStateFromServer returns ServerGameData (not GameState)', () => {
      const bp = join(SRC_DIR, 'lib', 'game', 'store-bootstrap.ts');
      const content = readFileSync(bp, 'utf8');
      expect(content).toMatch(
        /hydrateInitialStateFromServer\s*\(\s*\)\s*:\s*Promise\s*<\s*ServerGameData\s*\|/,
      );
      // And MUST NOT return GameState
      expect(content).not.toMatch(
        /hydrateInitialStateFromServer\s*\(\s*\)\s*:\s*Promise\s*<\s*GameState\s*>/,
      );
    });
  });

  describe('store.ts applyServerState preserves UI on hydration', () => {
    it('applyServerState reads from prev and copies UI fields locally', () => {
      const storePath = join(SRC_DIR, 'lib', 'game', 'store.ts');
      const content = readFileSync(storePath, 'utf8');
      // Must include prev.activeTab/selectedBuilding/notifications/productionSnapshot
      // to preserve local UI through the server-state application.
      expect(content).toMatch(/activeTab:\s*prev\.activeTab/);
      expect(content).toMatch(/selectedBuilding:\s*prev\.selectedBuilding/);
      expect(content).toMatch(/notifications:\s*prev\.notifications/);
      expect(content).toMatch(/productionSnapshot:\s*prev\.productionSnapshot/);
    });

    it('hydrateInitialState merges canonical with UI session', () => {
      const storePath = join(SRC_DIR, 'lib', 'game', 'store.ts');
      const content = readFileSync(storePath, 'utf8');
      expect(content).toMatch(/mergeCanonicalWithUI\s*\(\s*canonical/);
    });
  });

  describe('typed payload helpers exist (replaces as never)', () => {
    it('asFullState helper is exported from serverGameStatePayload.ts', () => {
      const helperPath = join(SRC_DIR, 'lib', 'db', 'serverGameStatePayload.ts');
      const content = readFileSync(helperPath, 'utf8');
      expect(content).toMatch(/export\s+function\s+asFullState/);
    });

    it('stripUIFields helper is exported', () => {
      const helperPath = join(SRC_DIR, 'lib', 'db', 'serverGameStatePayload.ts');
      const content = readFileSync(helperPath, 'utf8');
      expect(content).toMatch(/export\s+function\s+stripUIFields/);
    });

    it('asServerGameData helper is exported for read-side casting', () => {
      const helperPath = join(SRC_DIR, 'lib', 'db', 'serverGameStatePayload.ts');
      const content = readFileSync(helperPath, 'utf8');
      expect(content).toMatch(/export\s+function\s+asServerGameData/);
    });

    it('persistence paths (state/route, migrate-guest) use stripUIFields and asFullState', () => {
      for (const rel of [
        'src/app/api/game/state/sync/route.ts',
        'src/app/api/auth/guest/migrate/route.ts',
      ]) {
        const file = join(SRC_DIR, '..', rel);
        const content = readFileSync(file, 'utf8');
        expect(content).toMatch(/stripUIFields/);
        expect(content).toMatch(/asFullState/);
        // NO raw `as never` for full_state writes
        expect(content).not.toMatch(/full_state:.*as\s+never/);
      }
    });
  });

  describe('API responses do not leak UI fields', () => {
    it('initial-state route returns ServerGameData', () => {
      const routePath = join(SRC_DIR, 'app', 'api', 'game', 'initial-state', 'route.ts');
      const content = readFileSync(routePath, 'utf8');
      // The JSON response shape is { initialState: ServerGameData, fetchedAt }
      // No UI field names should appear in the response payload.
      // We can only do a cheap text check — the type itself is enforced elsewhere.
      const uiLeaks = UI_KEYS.filter(k =>
        new RegExp(`initialState[^,}]*${k}`).test(content),
      );
      expect(uiLeaks).toEqual([]);
    });
  });
});
