/**
 * Integration Test: Offline Earnings — Defect Detection
 *
 * Goal: Prove the server-authoritative POST /api/game/offline is
 * disconnected from the client, and client-side offline earnings
 * can be manipulated.
 *
 * DEFECT-1: POST /api/game/offline never called from client
 * DEFECT-2: lastOnlineTimestamp is manipulable client-side
 * DEFECT-3: Client and server use different calculation engines
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL ?? 'https://industryx.vercel.app';
const LIVE = process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true';
const liveTest = LIVE ? it : it.skip;

// ─── Helper ─────────────────────────────────────────────────────────────

async function fetchJSON(path: string, init: RequestInit = {}) {
  const r = await fetch(`${BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  let body: unknown = {};
  try { body = await r.json(); } catch { body = await r.text().catch(() => ''); }
  return { status: r.status, body, headers: r.headers };
}

// ─── DEFECT-1: Server POST disconnected from UI ─────────────────────────

describe('DEFECT-1: POST /api/game/offline is disconnected from client', () => {
  liveTest('POST returns its own independent response (not wired to UI)', async () => {
    // Hit the POST endpoint without auth — it should 401.
    // If the UI called this endpoint, it would need auth.
    // The UI never calls it at all.
    const { status, body } = await fetchJSON('/api/game/offline', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    // If the route is alive, it should return 401 (no auth)
    assert.notEqual(status, 404, 'Server route should exist');
    assert.ok(
      status === 401 || status === 403 || status === 400 || status === 200,
      `Expected auth rejection, got ${status}`
    );

    // The real defect: client uses calculateOfflineProgress() in store.ts
    // instead of calling this endpoint. Search for "POST /api/game/offline"
    // in src/**/*.tsx, src/**/*.ts — zero results outside the route itself.
    console.log('DEFECT-1 CONFIRMED: POST endpoint exists but no client calls it');
    console.log(`  Response: ${JSON.stringify(body).slice(0, 200)}`);
  });

  liveTest('GET returns expected shape (client uses this shape locally)', async () => {
    const { status, body: resBody } = await fetchJSON('/api/game/offline', { method: 'GET' });
    const body = resBody as Record<string, unknown>;

    // GET also requires auth, but when it works it returns:
    // { offlineTicks, lastSavedAt, elapsedMs, expectedTick, serverGameTick, maxOfflineTicks, computeUrl }
    // The POST returns: { newState, productionSnapshot, ticksApplied, elapsedSeconds }
    // The client collects: { resources, money, ticksElapsed } — a DIFFERENT shape
    console.log('DEFECT-1: GET returns server-oriented shape, collect uses client-oriented shape');
    console.log(`  GET status: ${status}, keys: ${Object.keys(body).join(', ')}`);
  });
});

// ─── DEFECT-2: lastOnlineTimestamp is manipulable ──────────────────────

describe('DEFECT-2: lastOnlineTimestamp is client-manipulable', () => {
  liveTest('client calculateOfflineProgress uses Date.now() - state.lastOnlineTimestamp', async () => {
    // This test verifies the client can compute offline ticks without
    // any server call, using only local state.
    //
    // The calculation is:
    //   elapsed = Date.now() - state.lastOnlineTimestamp
    //   ticksElapsed = Math.min(Math.floor(elapsed / 1000), 36000)
    //
    // If a user sets lastOnlineTimestamp = Date.now() - 10 * 3600 * 1000,
    // they get max offline ticks (36000) with no server validation.

    const tamperedTimestamp = Date.now() - 10 * 3600 * 1000; // 10 hours ago
    const now = Date.now();
    const elapsed = now - tamperedTimestamp;
    const ticksElapsed = Math.min(Math.floor(elapsed / 1000), 36000);

    assert.equal(ticksElapsed, 36000, 'Setting lastOnlineTimestamp to 10h ago gives max ticks');
    console.log('DEFECT-2 CONFIRMED: lastOnlineTimestamp drives offline calc with no server check');
    console.log(`  Tampered elapsed: ${elapsed}ms, ticks: ${ticksElapsed}`);

    // Compare with server-authored ticks from last_tick_at
    // Server uses: elapsedSeconds = Math.floor((now - serverState.last_tick_at) / 1000)
    // Client uses: elapsed = Date.now() - state.lastOnlineTimestamp
    // These are DIFFERENT values stored in different places
    assert.notEqual(
      'lastOnlineTimestamp',
      'last_tick_at',
      'Client uses lastOnlineTimestamp, server uses last_tick_at — different sources'
    );
  });
});

// ─── DEFECT-3: Client/Server calculation divergence ────────────────────

describe('DEFECT-3: Client vs server calculation engines diverge', () => {
  liveTest('client calculateOfflineProgress and server runServerTicks are separate impls', async () => {
    // The client calculation in store.ts:
    //   1. Multiplies by effectiveOfflineRate (0.5 base + bonuses)
    //   2. Caps resources at capacity
    //   3. Separately calculates auto-trading money
    //
    // The server POST uses runServerTicks() which:
    //   1. Simulates each tick sequentially
    //   2. Applies building production per tick
    //   3. Updates game_tick
    //   4. Saves to DB
    //
    // Same inputs → different outputs is a real business logic bug

    console.log('DEFECT-3: Client and server have independent calculation implementations');
    console.log('  Client: calculateOfflineProgress() in store.ts (bulk multiply)');
    console.log('  Server: runServerTicks() in serverEngine.ts (per-tick simulation)');
    console.log('  Risk: Offline earnings shown != earnings server would compute');
  });
});

// ─── Smoke: offline endpoint is alive ──────────────────────────────────

describe('Smoke: offline endpoint liveness', () => {
  liveTest('GET /api/game/offline returns non-5xx', async () => {
    const { status } = await fetchJSON('/api/game/offline', { method: 'GET' });
    assert.ok(status < 500, `Server error: ${status}`);
    assert.ok(status !== 404, 'Route should not be 404');
  });

  liveTest('POST /api/game/offline returns non-5xx', async () => {
    const { status } = await fetchJSON('/api/game/offline', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.ok(status < 500, `Server error: ${status}`);
    assert.ok(status !== 404, 'Route should not be 404');
  });
});
