// src/app/api/admin/production-telemetry/route.ts
//
// GET /api/admin/production-telemetry — admin audit endpoint for the
// production telemetry counters (PR-BP-5 §7).
//
// Auth: verifyAdmin() gates the route. Read-only telemetry — same gate as
// /api/admin/system/monitoring and /api/admin/market/overview (read vs
// write distinction from the auth orchestrator plan §21).
//
// Rate limit: RATE_LIMITS.admin (best-effort profile; same as
// /api/admin/bootstrap-audit).
//
// Response shape: ProductionTelemetry from
// src/lib/admin/observability/productionTelemetry.

import { NextResponse } from "next/server";

import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import {
  listSilentFailureReasons,
  readProductionTelemetry,
} from "@/lib/admin/observability/productionTelemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const rateLimited = await checkRateLimit(
    authResult.admin.id,
    RATE_LIMITS.admin,
    "/api/admin/production-telemetry",
  );
  if (rateLimited) return rateLimited;

  const telemetry = readProductionTelemetry();

  // Document the canonical reason set in the response so an admin client
  // (dashboard / CLI) can render label maps without re-importing the engine.
  return withSecurityHeaders(
    NextResponse.json({
      ...telemetry,
      silent_failure_reasons: listSilentFailureReasons(),
    }),
  );
}