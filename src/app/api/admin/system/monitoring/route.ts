// src/app/api/admin/system/monitoring/route.ts
// Admin-only GET endpoint returning capacity + activity + Supabase + Cloudflare metrics.
// Capacity data comes from get_capacity_status() RPC (server-authoritative).
// Cloudflare/Supabase infra data is best-effort; failures do not break the dashboard.
// Iteration 8: routed pg_database_size RPC through db/index.ts.

import { NextResponse } from 'next/server';
import { verifyAdmin, withSecurityHeaders } from '@/lib/auth/admin';
import { getCapacityStatus } from '@/lib/capacity';
import { getDatabaseSizeMb } from '@/lib/db/infra/infra';

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

  const capacity = await getCapacityStatus();
  const dbSizeMb = await getDatabaseSizeMb();
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
    db_size_mb: dbSizeMb,
    cloudflare,
  });
  return withSecurityHeaders(response);
}