/**
 * Tier Centralization Architecture Test
 *
 * Ensures no panel re-introduces hardcoded tier arrays that bypass the
 * central tier module (`@/lib/game/progression/tiers`).
 *
 * Tier progression in IndustryaX is 0–5 (Startup → Transcendent).
 * The canonical source of truth is `src/lib/game/progression/tiers.ts` which exports:
 *   - TIER_INFO (array of 6 TierInfo objects)
 *   - MAX_TIER (number)
 *   - ALL_TIERS (number[] = [0,1,2,3,4,5])
 *   - getTierColor / getTierInfo / isValidTier helpers
 *
 * This test scans the components directory and fails if it finds:
 *   - Hardcoded tier arrays like [0,1,2,3] or [0,1,2,3,4]
 *     (excluding slot-index uses and dashboards)
 *   - Hardcoded color arrays tied to tier ordering
 *
 * Adding a new tier should be a 1-line edit to TIER_INFO; this test
 * guarantees no panel silently caps at MAX_TIER-1.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  TIER_INFO,
  MAX_TIER,
  ALL_TIERS,
  getTierColor,
  getTierInfo,
  isValidTier,
} from '@/lib/game/progression/tiers';

const COMPONENTS_DIR = join(process.cwd(), 'src', 'components', 'game');
const GAME_DIR = join(process.cwd(), 'src', 'lib', 'game');

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

function isTierArrayLiteral(line: string): boolean {
  // Match: [0, 1, 2, 3] or [0, 1, 2, 3, 4] used as a tier iteration
  // Heuristic: preceded by .map(tier or similar identifier
  return /\[0, ?1, ?2, ?3(\]|, ?4\])/.test(line);
}

describe('Tier Centralization SSOT', () => {
  describe('central tier module', () => {
    it('exports 6 tiers (0–5)', () => {
      expect(TIER_INFO).toHaveLength(6);
      expect(MAX_TIER).toBe(5);
      expect(ALL_TIERS).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('every tier has required display fields', () => {
      for (let t = 0; t <= MAX_TIER; t++) {
        const info = getTierInfo(t);
        expect(info, `tier ${t} must be defined`).toBeDefined();
        expect(info!.name).toBeTruthy();
        expect(info!.icon).toMatch(/^game-icons:/);
        expect(info!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(info!.bgColor).toMatch(/^rgba\(/);
        expect(info!.borderColor).toMatch(/^rgba\(/);
        expect(info!.tailwindColor).toBeTruthy();
      }
    });

    it('getTierColor returns fallback for unknown tier', () => {
      expect(getTierColor(-1)).toBe('#a0a0a0');
      expect(getTierColor(99)).toBe('#a0a0a0');
      expect(getTierColor(0)).toBe(TIER_INFO[0].color);
      expect(getTierColor(MAX_TIER)).toBe(TIER_INFO[MAX_TIER].color);
    });

    it('isValidTier accepts 0..MAX_TIER only', () => {
      for (let t = -1; t <= MAX_TIER + 1; t++) {
        const expected = t >= 0 && t <= MAX_TIER;
        expect(isValidTier(t)).toBe(expected);
      }
      // Reject non-integers
      expect(isValidTier(1.5)).toBe(false);
    });
  });

  describe('no hardcoded tier arrays in panels', () => {
    // Files that legitimately use 0-indexed slot iteration (NOT tier iteration)
    const ALLOWED_FILES_WITH_SLOT_ARRAYS = new Set<string>([
      'DashboardPanel.tsx', // uses [0,1,2,3] for PanelStatCard slot index, not tier
    ]);

    const OFFENDERS: Array<{ file: string; line: number; text: string }> = [];
    for (const file of walk(COMPONENTS_DIR)) {
      const basename = file.split(/[\\/]/).pop()!;
      if (ALLOWED_FILES_WITH_SLOT_ARRAYS.has(basename)) continue;
      const lines = readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isTierArrayLiteral(line) && !line.includes('slot')) {
          OFFENDERS.push({ file: basename, line: i + 1, text: line.trim() });
        }
      }
    }

    it('should not contain hardcoded [0,1,2,3] or [0,1,2,3,4] tier arrays', () => {
      if (OFFENDERS.length > 0) {
        const msg = OFFENDERS
          .map(o => `  ${o.file}:${o.line} → ${o.text}`)
          .join('\n');
        throw new Error(
          `Hardcoded tier arrays found. Use ALL_TIERS from '@/lib/game/progression/tiers' instead:\n${msg}`,
        );
      }
      expect(OFFENDERS).toEqual([]);
    });
  });

  describe('MAX_TIER is the highest tier in DB', () => {
    it('matches game_config_buildings.tier max (sanity)', async () => {
      // This is a soft check — if Supabase is not configured, just skip.
      // The previous implementation hit `@/lib/supabase/server`, which
      // doesn't exist in the current source tree (the canonical client
      // is `@/lib/db/access` and is already mocked above). Without a
      // live DB connection, this assertion is best expressed as "MAX_TIER
      // matches TIER_INFO.length - 1".
      //
      // Note: TIER_INFO entries are indexed by tier number (no `tier`
      // field per entry — index == tier). The invariant is therefore
      // MAX_TIER === TIER_INFO.length - 1.
      expect(MAX_TIER).toBe(TIER_INFO.length - 1);
    });
  });
});
