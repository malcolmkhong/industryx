/**
 * tests/api/auth/migrate-guest.test.ts
 *
 * Boundary + auth + decision-branch tests for POST /api/auth/migrate-guest.
 *
 * Coverage:
 *   - 400 when required fields missing
 *   - 401 when auth/ownership verification fails
 *   - 429 when rate-limited
 *   - 200 + `action: 'use_cloud'` when cloud state already exists (skip)
 *   - 200 + `action: 'reset'` when migration rejected (cheating)
 *   - 200 + `action: 'accept'` happy path (state persisted)
 *   - 200 + `action: 'accept_with_flag'` (flag cheat but accept)
 *   - 500 when upsert fails
 *   - 500 when unexpected error thrown
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { buildRequest, readJson } from '../helpers/request';
import { mockSupabaseServer } from '../../unit/mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());
vi.mock('@/lib/auth/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { action: { limit: 100, windowMs: 60000 }, general: { limit: 200, windowMs: 60000 } },
}));
vi.mock('@/lib/auth/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
  verifyAuthAndOwnership: vi.fn().mockResolvedValue({ success: true, userId: 'user-1', email: 'test@example.com' }),
}));

const validateGuestMigration = vi.fn();
const validateGameStateFn = vi.fn();
vi.mock('@/lib/auth/guestMigrationValidator', () => ({
  validateGuestMigration: (...args: unknown[]) => validateGuestMigration(...args),
}));
const extractValidatedSaveFieldsFn = vi.fn();
vi.mock('@/lib/auth/gameStateValidator', () => ({
  validateGameState: (...args: unknown[]) => validateGameStateFn(...args),
  extractValidatedSaveFields: (...args: unknown[]) =>
    extractValidatedSaveFieldsFn(...args),
  generateChecksum: vi.fn(() => 'mock-checksum'),
  flagCheatAttempt: vi.fn(async () => undefined),
  logActionAsync: vi.fn(),
}));

const getGameTickMock = vi.fn();
const upsertServerGameStateMock = vi.fn();
vi.mock('@/lib/db/serverGameState', () => ({
  getGameTick: (...args: unknown[]) => getGameTickMock(...args),
  upsertServerGameState: (...args: unknown[]) => upsertServerGameStateMock(...args),
}));
vi.mock('@/lib/db/playerProgress', () => ({
  upsertPlayerProgress: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/initialState.server', () => ({
  fetchCanonicalInitialState: vi.fn(async () => ({
    money: 1000, // mirrors balanceConfig.offline.startingMoney default
    totalMoneyEarned: 0,
    researchPoints: 0,
    buildings: [],
    completedResearch: [],
    resources: {},
    workers: [],
    gameTick: 0,
    gameSpeed: 1,
  })),
}));

import { POST } from '@/app/api/auth/migrate-guest/route';

// ─── helpers ────────────────────────────────────────────────────────────

const VALID_GAME_STATE: Record<string, unknown> = {
  money: 1500,
  totalMoneyEarned: 2000,
  gameTick: 100,
  gameSpeed: 1,
  buildings: [],
  completedResearch: [],
  researchPoints: 0,
  resources: {},
  workers: [],
};

const REJECT_RESULT = {
  isValid: false,
  riskLevel: 'critical' as const,
  violations: ['Impossible wealth-to-time ratio'],
  checks: [
    { name: 'wealth_ratio', passed: false, severity: 'critical' as const, detail: 'money too high' },
  ],
  action: 'reject' as const,
  summary: 'Guest state failed validation — cheating detected',
};

const FLAG_RESULT = {
  isValid: true,
  riskLevel: 'medium' as const,
  violations: ['borderline ratio'],
  checks: [
    { name: 'wealth_ratio', passed: true, severity: 'medium' as const, detail: 'within tolerance' },
  ],
  action: 'accept_with_flag' as const,
  summary: 'Flagged but within tolerance',
};

const ACCEPT_RESULT = {
  isValid: true,
  riskLevel: 'low' as const,
  violations: [],
  checks: [
    { name: 'wealth_ratio', passed: true, severity: 'none' as const, detail: 'ok' },
  ],
  action: 'accept' as const,
  summary: 'Valid',
};

const STANDARD_VALIDATION = { violations: [], riskLevel: 'none' as const };

function resetMocks(opts: {
  existingCloudTick?: number | null;
  // Loose type so callers can switch between ACCEPT/FLAG/REJECT across tests.
  migrationResult?: unknown;
  upsertSuccess?: boolean;
} = {}) {
  getGameTickMock.mockReset().mockResolvedValue(opts.existingCloudTick ?? null);
  upsertServerGameStateMock.mockReset().mockResolvedValue(opts.upsertSuccess ?? true);
  validateGuestMigration.mockReset().mockImplementation(() => opts.migrationResult ?? ACCEPT_RESULT);
  validateGameStateFn.mockReset().mockReturnValue(STANDARD_VALIDATION);
  extractValidatedSaveFieldsFn.mockReset().mockImplementation(
    (gs: Record<string, unknown>) => ({
      money: Number(gs.money) || 0,
      totalMoneyEarned: Number(gs.totalMoneyEarned) || 0,
      researchPoints: Number(gs.researchPoints) || 0,
      gameTick: Number(gs.gameTick) || 0,
      gameSpeed: Number(gs.gameSpeed) || 1,
      buildingsCount: Array.isArray(gs.buildings)
        ? (gs.buildings as unknown[]).length
        : 0,
    }),
  );
}

// ─── tests ──────────────────────────────────────────────────────────────

describe('POST /api/auth/migrate-guest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  // ── input validation ──

  it('returns 400 when userId is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/userId/);
  });

  it('returns 400 when gameState is missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/gameState/);
  });

  it('returns 400 when both userId and gameState are missing', async () => {
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── auth failure ──

  it('forwards auth failure (verifyAuthAndOwnership non-success)', async () => {
    const failureResponse = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { verifyAuthAndOwnership } = await import('@/lib/auth/verifyAuth');
    (verifyAuthAndOwnership as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: failureResponse,
    });

    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1', gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  // ── rate limit ──

  it('returns 429 when rate-limited', async () => {
    const { checkRateLimit } = await import('@/lib/auth/rateLimiter');
    const rateResponse = NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rateResponse);

    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1', gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  // ── cloud state already exists → skip migration ──

  it('returns 200 with action: "use_cloud" when cloud state already exists', async () => {
    resetMocks({ existingCloudTick: 500, migrationResult: ACCEPT_RESULT });
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1', gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      migrated: boolean;
      action: string;
      cloudTick: number;
    }>(res);
    expect(body.migrated).toBe(false);
    expect(body.action).toBe('use_cloud');
    expect(body.cloudTick).toBe(500);
    expect(upsertServerGameStateMock).not.toHaveBeenCalled();
  });

  // ── reject branch ──

  it('returns 200 with action: "reset" when migration rejected + flag cheat + zero state', async () => {
    resetMocks({ migrationResult: REJECT_RESULT });
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1', gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      migrated: boolean;
      action: string;
      violations: string[];
      riskLevel: string;
    }>(res);
    expect(body.migrated).toBe(false);
    expect(body.action).toBe('reset');
    expect(body.violations.length).toBeGreaterThan(0);
    expect(body.riskLevel).toBe('critical');
    // Reset state saved with cheat flag
    expect(upsertServerGameStateMock).toHaveBeenCalledTimes(1);
    const saved = upsertServerGameStateMock.mock.calls[0]?.[0] as {
      money: number;
      cheat_flag_count: number;
      state_version: number;
    };
    expect(saved.money).toBe(1000);
    expect(saved.cheat_flag_count).toBe(1);
    expect(saved.state_version).toBe(1);
  });

  // ── accept_with_flag branch ──

  it('returns 200 + flags cheat + saves state on accept_with_flag', async () => {
    const { flagCheatAttempt } = await import('@/lib/auth/gameStateValidator');
    resetMocks({ migrationResult: FLAG_RESULT });
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1', gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      migrated: boolean;
      action: string;
      stateHash: string;
    }>(res);
    expect(body.migrated).toBe(true);
    expect(body.action).toBe('accept_with_flag');
    expect(body.stateHash).toBe('mock-checksum');
    expect(flagCheatAttempt).toHaveBeenCalledWith(
      'user-1',
      'guest_migration_flagged',
      expect.any(String),
      expect.any(String),
    );
    expect(upsertServerGameStateMock).toHaveBeenCalledTimes(1);
  });

  // ── accept happy path ──

  it('returns 200 + saves state on accept', async () => {
    resetMocks({ migrationResult: ACCEPT_RESULT });
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1', gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      migrated: boolean;
      action: string;
      message: string;
    }>(res);
    expect(body.migrated).toBe(true);
    expect(body.action).toBe('accept');
    expect(body.message).toContain('migrated');
    expect(upsertServerGameStateMock).toHaveBeenCalledTimes(1);
    const saved = upsertServerGameStateMock.mock.calls[0]?.[0] as {
      user_id: string;
      game_tick: number;
      cheat_flag_count: number;
    };
    expect(saved.user_id).toBe('user-1');
    expect(saved.game_tick).toBe(100);
    expect(saved.cheat_flag_count).toBe(0);
  });

  // ── upsert failure ──

  it('returns 500 when upsertServerGameState fails', async () => {
    resetMocks({ migrationResult: ACCEPT_RESULT, upsertSuccess: false });
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1', gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toBe('Failed to save cloud state');
  });

  // ── unexpected throw ──

  it('returns 500 on unexpected throw', async () => {
    validateGuestMigration.mockImplementationOnce(() => {
      throw new Error('explosion');
    });
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: { userId: 'user-1', gameState: VALID_GAME_STATE },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await readJson<{ error?: string }>(res);
    expect(body.error).toMatch(/Internal server error/);
  });

  // ── displayName sanitization ──

  it('sanitizes displayName (strips control chars + angle brackets, caps length)', async () => {
    resetMocks({ migrationResult: ACCEPT_RESULT });
    const req = buildRequest({
      method: 'POST',
      url: '/api/auth/migrate-guest',
      body: {
        userId: 'user-1',
        gameState: VALID_GAME_STATE,
        displayName: '<script>alert(1)</script>' + 'A'.repeat(50),
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Calls upsertPlayerProgress with sanitized name
    const { upsertPlayerProgress } = await import('@/lib/db/playerProgress');
    const calls = (upsertPlayerProgress as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const playerProgressArg = calls[0]?.[1] as { display_name: string };
    expect(playerProgressArg.display_name).not.toMatch(/[<>]/);
    expect(playerProgressArg.display_name.length).toBeLessThanOrEqual(32);
  });
});
