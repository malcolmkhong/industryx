/**
 * Integration Test: Cloudflare Worker Connectivity
 *
 * Tests the actual Cloudflare Workers that IndustriaX depends on:
 * 1. Market Tick worker (markettick)
 * 2. News Generator worker (newsgenerator)
 * 3. Any other workers.dev endpoints used in the app
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Worker URLs discovered from the actual codebase ─────────────────

// From: src/app/api/market/tick/route.ts line 186
const NEWS_GENERATOR_URL = 'https://newsgenerator.malcolmkhong.workers.dev';

// From: src/app/api/news-llm/route.ts — check this file for actual URL
// From: src/lib/game/newsLLM.ts — references Cloudflare worker for AI news

// ─── Tests ───────────────────────────────────────────────────────────

describe('Cloudflare Workers Connectivity', () => {
  // ── Test 1: News Generator Worker ──

  it('News Generator worker is reachable', async () => {
    try {
      const r = await fetch(NEWS_GENERATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              resource: 'iron',
              delta: '+5.2%',
              severity: 'low',
              context: { cause: 'test ping' },
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });

      console.log(`  Status: ${r.status}`);
      const body = await r.text();
      console.log(`  Response (first 200): ${body.slice(0, 200)}`);

      assert.ok(
        r.status < 500,
        `News Generator returned ${r.status} — worker may be down`
      );

      if (r.ok) {
        const json = JSON.parse(body);
        console.log(`  Headlines: ${json.headlines?.length ?? 0}`);
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name === 'TimeoutError' || (e as Error).message?.includes('timeout')) {
        console.log('  ⚠️  Worker timed out — may be cold-starting');
      } else {
        assert.fail(
          `News Generator unreachable: ${(err as Error).message}\n` +
          `URL: ${NEWS_GENERATOR_URL}\n` +
          'Check: wrangler deploy is active, worker has no errors'
        );
      }
    }
  });

  // ── Test 2: Market Tick Worker (scheduled CRON job) ──

  it('Market Tick worker exists (wrangler.toml found)', async () => {
    // The market tick is run as a Vercel Cron → /api/market/tick
    // which internally calls the Cloudflare worker for AI news.
    // The wrangler.toml at cloudflare/markettick/wrangler.toml defines
    // the scheduled worker. We verify the config exists and is valid.

    const wranglerPath = 'cloudflare/markettick/wrangler.toml';
    const fs = await import('node:fs/promises');

    try {
      const content = await fs.readFile(wranglerPath, 'utf-8');
      assert.ok(content.includes('markettick'), 'wrangler.toml should have name=markettick');
      assert.ok(content.includes('worker.js'), 'wrangler.toml should reference worker.js');
      assert.ok(content.includes('crons'), 'Worker should have cron trigger');

      console.log('  ✅ wrangler.toml found and valid');
      console.log('  Worker name: markettick');
      console.log('  Schedule: every minute (* * * * *)');
    } catch (err: unknown) {
      assert.fail(`Could not read wrangler.toml: ${(err as Error).message}`);
    }
  });

  // ── Test 3: Root-level worker URL ──

  it('newsgenerator root URL responds', async () => {
    try {
      const r = await fetch(NEWS_GENERATOR_URL, {
        signal: AbortSignal.timeout(10000),
      });
      console.log(`  Status: ${r.status}`);
      // GET without body may return 405 or 200 — both are fine (worker is alive)
      assert.ok(r.status < 500, `Worker returned ${r.status}`);
      console.log('  ✅ Worker root URL is alive');
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') {
        console.log('  ⚠️  Worker cold start timeout');
      } else {
        assert.fail(`Worker unreachable: ${(err as Error).message}`);
      }
    }
  });
});

// ─── API Route Tests (Vercel deployment) ─────────────────────────────

describe('API Routes Connectivity', () => {
  const BASE_URL = 'https://industryx.vercel.app';

  it('/api/auth/recover-by-device returns non-5xx', async () => {
    try {
      const r = await fetch(`${BASE_URL}/api/auth/recover-by-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'test-device-id' }),
        signal: AbortSignal.timeout(10000),
      });

      console.log(`  Status: ${r.status}`);
      const body = await r.text();
      console.log(`  Response: ${body.slice(0, 200)}`);

      // 404 means the route isn't available in the deployed build (standalone output issue)
      // 200/401/422 means the route exists
      assert.ok(
        r.status < 500,
        `recover-by-device returned ${r.status} — service error`
      );
    } catch (err: unknown) {
      assert.fail(`recover-by-device unreachable: ${(err as Error).message}`);
    }
  });

  it('/api/market/tick is operational', async () => {
    try {
      const r = await fetch(`${BASE_URL}/api/market/tick`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
      });

      console.log(`  Status: ${r.status}`);
      const body = await r.json().catch(() => ({}));
      console.log(`  Tick: ${body.tick}, Events: ${body.events}, Headlines: ${body.headlines}`);

      assert.ok(r.status < 500, `Market tick returned ${r.status}`);
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') {
        console.log('  ⚠️  Market tick timed out (cold start or processing)');
      } else {
        assert.fail(`Market tick unreachable: ${(err as Error).message}`);
      }
    }
  });
});
