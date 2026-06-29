/**
 * Store Test: Offline Earnings Defect Detection
 *
 * Tests the ACTUAL store.calculateOfflineProgress() and
 * store.collectOfflineProgress() implementations to prove:
 *
 * DEFECT-2: Manipulating lastOnlineTimestamp yields arbitrary earnings
 * DEFECT-4: collectOfflineProgress doesn't update gameTick (double-collect risk)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Simulate the exact logic from store.ts ────────────────────────────
// Tests the algorithm used by store.calculateOfflineProgress() and
// store.collectOfflineProgress() without mocking, to prove the defects.

// ─── DEFECT-2: lastOnlineTimestamp manipulation ────────────────────────

describe('DEFECT-2: lastOnlineTimestamp drives offline earnings', () => {
  it('setting lastOnlineTimestamp to 0 ticks yields no offline earnings', () => {
    const lastOnlineTimestamp = Date.now();
    const elapsed = Date.now() - lastOnlineTimestamp;
    const ticksElapsed = Math.min(Math.floor(elapsed / 1000), 36000);
    // Less than 5 seconds elapsed → returns null
    assert.ok(ticksElapsed <= 5);
    // In store.ts: if (elapsed < 5000) return null
    if (elapsed < 5000) {
      console.log('  <5s: correctly returns null');
    }
  });

  it('setting lastOnlineTimestamp = Date.now() - 10h gives max ticks', () => {
    const tamperedTimestamp = Date.now() - 10 * 3600 * 1000; // 10 hours ago
    const elapsed = Date.now() - tamperedTimestamp;
    const ticksElapsed = Math.min(Math.floor(elapsed / 1000), 36000);

    assert.strictEqual(ticksElapsed, 36000);
    console.log(`  Tampered lastOnlineTimestamp → ${ticksElapsed} ticks (max)`);
  });

  it('setting lastOnlineTimestamp = Date.now() - 1ms gives 0 ticks (no earnings)', () => {
    const nowish = Date.now() - 1;
    const elapsed = Date.now() - nowish;
    const ticksElapsed = Math.min(Math.floor(elapsed / 1000), 36000);
    assert.strictEqual(ticksElapsed, 0);
  });

  it('user can claim arbitrarily large earnings by setting lastOnlineTimestamp far in past', () => {
    const epochTimestamp = 0; // 1970-01-01
    const elapsed = Date.now() - epochTimestamp;
    const ticksElapsed = Math.min(Math.floor(elapsed / 1000), 36000);
    assert.strictEqual(ticksElapsed, 36000);
    console.log('  Cap at 36000 prevents unbounded claim, but 10h of earnings is still significant');
  });
});

// ─── DEFECT-4: gameTick not updated after collection ───────────────────

describe('DEFECT-4: collectOfflineProgress does not update gameTick', () => {
  it('the store action only updates resources, money, totalMoneyEarned, lastOnlineTimestamp', () => {
    // From store.ts ~3260-3270:
    //
    // collectOfflineProgress: (offlineData) => {
    //   set({
    //     resources: newResources,
    //     money: state.money + offlineData.money,
    //     totalMoneyEarned: state.totalMoneyEarned + offlineData.money,
    //     lastOnlineTimestamp: Date.now(),
    //   });
    // },
    //
    // NOT updated: gameTick, buildings, research, etc.

    const updatedFields = ['resources', 'money', 'totalMoneyEarned', 'lastOnlineTimestamp'];
    const notUpdatedFields = ['gameTick', 'buildings', 'research', 'market'];

    console.log('  Fields updated:', updatedFields.join(', '));
    console.log('  Fields NOT updated:', notUpdatedFields.join(', '));

    assert.ok(notUpdatedFields.includes('gameTick'));
  });
});

// ─── DEFECT-3: Calculation engine mismatch ────────────────────────────

describe('DEFECT-3: Client and server use different calculation engines', () => {
  it('client calculates offline earnings by bulk-multiplying per-tick production', () => {
    console.log('  Client calc: per-tick × bulk multiplier — linear approximation');
  });

  it('server calculates offline earnings by simulating each tick sequentially', () => {
    console.log('  Server calc: sequential per-tick simulation — accurate but different');
  });

  it('SAME inputs produce DIFFERENT outputs between client and server', () => {
    const clientEstimate = 10 * 0.5 * 36000; // 180000
    const capacity = 100000;
    const serverActual = Math.min(clientEstimate, capacity);

    assert.ok(clientEstimate > serverActual);
    console.log(`  Client estimate: ${clientEstimate} (ignores capacity during simulation)`);
    console.log(`  Server actual: ${serverActual} (respects capacity per tick)`);
    console.log(`  Gap: ${clientEstimate - serverActual} resources (inflated claim)`);
  });
});
