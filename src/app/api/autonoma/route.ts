/**
 * Autonoma test-data endpoint — `/api/autonoma`.
 *
 * Bridges Next.js App Router requests to the `@autonoma-ai/sdk`
 * `handleRequest` entry point. Handles:
 *
 *   - `discover` — returns the factory schema (Zod-derived) so the
 *     Autonoma dashboard can render the data model.
 *   - `up`       — creates test data through the registered factories,
 *     mints an auth payload, returns refs + a signed teardown token.
 *   - `down`     — verifies the signed token, tears down by the recorded
 *     refs (no FK-leaked rows; in reverse dependency order).
 *
 * Security:
 *   - HMAC verification of `x-signature` is done by the SDK against
 *     `AUTONOMA_SHARED_SECRET` from the environment. We never invent a
 *     secret.
 *   - Refs are signed with `CHECKSUM_SECRET` (a pre-existing
 *     app-managed secret) so only this endpoint can authorize teardown.
 *   - The endpoint only reads `x-signature`; body, headers, and signature
 *     flow through the SDK as-is.
 *
 * Lifecycle:
 *   - This route is gated to non-production deploys by the SDK's own
 *     docs ("never run in production"). We additionally 404 in
 *     `NODE_ENV=production` so a misconfigured deploy can't seed
 *     test data on a live cluster.
 */

import { NextResponse, type NextRequest } from "next/server";
import { handleRequest } from "@autonoma-ai/sdk";

import { factories } from "@/lib/autonoma/factories";
import { buildAuthPayload } from "@/lib/autonoma/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Refuse to run in production. The Autonoma SDK treats this endpoint
 *  as a developer-only environment factory; production builds must
 *  not have it mounted. Fail closed with a 404 so a misconfigured
 *  deploy doesn't accidentally seed test data. */
function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

const SHARED_SECRET = process.env.AUTONOMA_SHARED_SECRET;
const SIGNING_SECRET = process.env.CHECKSUM_SECRET;

async function handlePost(request: NextRequest) {
  if (isProductionEnv()) {
    return NextResponse.json(
      { error: "Autonoma endpoint is disabled in production" },
      { status: 404 },
    );
  }

  if (!SHARED_SECRET || !SIGNING_SECRET) {
    return NextResponse.json(
      {
        error:
          "Autonoma endpoint requires AUTONOMA_SHARED_SECRET and CHECKSUM_SECRET",
      },
      { status: 503 },
    );
  }

  // Build the headers bag the SDK expects: lowercase keys, scalar values.
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (typeof value === "string") headers[key.toLowerCase()] = value;
  });

  const raw = await request.text();
  const action = (() => {
    try {
      return JSON.parse(raw).action;
    } catch {
      return "?";
    }
  })();
  console.log(`[autonoma] handleRequest action=${action} bytes=${raw.length}`);
  const result = await handleRequest(
    {
      scopeField: "userId",
      sharedSecret: SHARED_SECRET,
      signingSecret: SIGNING_SECRET,
      factories,
      auth: buildAuthPayload,
    },
    { body: raw, headers },
  );
  console.log(
    `[autonoma] handleRequest action=${action} → status=${result.status}`,
  );

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}

export async function GET(request: NextRequest) {
  // Some SDKs probe GET for health; we mirror POST so a wrong verb still
  // returns the discover schema. The SDK itself routes by `action` field
  // in the body, so this is harmless either way.
  return handlePost(request);
}
