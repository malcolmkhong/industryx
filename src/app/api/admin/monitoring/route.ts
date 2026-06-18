// src/app/api/admin/monitoring/route.ts
// Admin-only GET endpoint returning capacity + activity + Supabase + Cloudflare metrics.
// Capacity data comes from get_capacity_status() RPC (server-authoritative).
// Cloudflare/Supabase infra data is best-effort; failures do not break the dashboard.

import { NextResponse } from 'next/server';
import { verifyAdmin, withSecurityHeaders } from '@/lib/auth/admin';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCapacityStatus } from '@/lib/capacity';

export const dynamic = 'force-dynamic';

interface CloudflareMetrics {
  status: 'configured' | 'missing_token' | 'error';
  workers_today?: number;
  cron_today?: number;
  ai_calls_today?: number;
  ai_neurons_today?: number;
  detail?: string;
}

async function fetchCloudflareMetrics(): Promise<CloudflareMetrics> {
  const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!cfApiToken || !cfAccountId) {
    return { status: 'missing_token' };
  }

  try {
    // GraphQL query for today's Workers invocations and Workers AI neurons.
    //
    // Schema reference: https://developers.cloudflare.com/analytics/graphql-api/
    //
    // FIX (AUDIT_FIXES_2026_06_18.md P0-#7): The previous query used the legacy
    // `workersInvocationsAdaptive` field which was deprecated and returns 0 on
    // current accounts. Replaced with `workersInvocationsAdaptiveGroups` (note
    // the `Groups` suffix) which is the current production field. GraphQL
    // aliases (`requestsToday: ...`) let multiple aggregations coexist on a
    // single field selection. Errors are surfaced via `json.errors` so the
    // dashboard can tell the admin what's wrong instead of silently returning 0.
    const today = new Date().toISOString().slice(0, 10);
    const query = `{
      viewer {
        accounts(filter: {accountTag: "${cfAccountId}"}) {
          requestsToday: workersInvocationsAdaptiveGroups(
            limit: 1
            filter: {date_geq: "${today}"}
          ) {
            sum {
              requests
              errors
            }
          }
          neuronsToday: aiInferenceAdaptiveGroupsByDate(
            limit: 1
            filter: {date_geq: "${today}"}
          ) {
            sum { neurons }
          }
        }
      }
    }`;

    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      return { status: 'error', detail: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as {
      data?: {
        viewer?: {
          accounts?: Array<{
            requestsToday?: { sum?: { requests?: number; errors?: number } };
            neuronsToday?: { sum?: { neurons?: number } };
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    // Surface GraphQL errors (schema mismatch, auth failure) so the admin
    // dashboard can show the real reason instead of silently returning 0.
    if (json.errors && json.errors.length > 0) {
      return {
        status: 'error',
        detail: json.errors.map((e) => e.message).join('; '),
      };
    }

    const account = json.data?.viewer?.accounts?.[0];
    if (!account) {
      return {
        status: 'configured',
        workers_today: 0,
        ai_neurons_today: 0,
        detail: 'No account data returned (check CLOUDFLARE_ACCOUNT_ID)',
      };
    }

    return {
      status: 'configured',
      workers_today: account.requestsToday?.sum?.requests ?? 0,
      ai_neurons_today: account.neuronsToday?.sum?.neurons ?? 0,
    };
  } catch (e) {
    return {
      status: 'error',
      detail: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

export async function GET() {
  const authResult = await verifyAdmin();
  if ('error' in authResult) return authResult.error;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    );
  }

  const capacity = await getCapacityStatus();

  // Supabase DB size — best-effort. pg_database_size may not be exposed via REST RPC.
  let dbSizeMb = 0;
  try {
    // Cast through unknown — pg_database_size returns a bigint, REST gives it as a string
    const { data, error } = await supabase.rpc('pg_database_size' as never);
    if (!error && data != null) {
      const bytes = typeof data === 'string' ? Number(data) : Number(data);
      if (Number.isFinite(bytes) && bytes > 0) {
        dbSizeMb = Math.round((bytes / 1024 / 1024) * 100) / 100;
      }
    }
  } catch {
    // Silently fall through; dbSizeMb stays 0
  }

  const cloudflare = await fetchCloudflareMetrics();

  const response = NextResponse.json({
    capacity: {
      total_players: capacity.total,
      registered_users: capacity.registered,
      guest_users: capacity.guests,
      waitlist_count: capacity.waitlistCount,
      capacity_limit: capacity.max,
      utilization_pct: capacity.utilizationPct,
      status: capacity.status,
    },
    activity: {
      active_15m: capacity.active15m,
      active_24h: capacity.active24h,
      active_7d: capacity.active7d,
    },
    supabase: {
      db_size_mb: dbSizeMb,
      db_limit_mb: 500,
    },
    cloudflare,
    timestamp: new Date().toISOString(),
  });

  return withSecurityHeaders(response);
}
