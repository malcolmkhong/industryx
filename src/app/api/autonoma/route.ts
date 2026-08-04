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
 *   - Refs are signed with `AUTONOMA_SIGNING_SECRET` (per SDK docs).
 *     Falls back to `CHECKSUM_SECRET` for backward-compat with existing
 *     deploys — gameplay state HMAC uses the same key so we don't have
 *     to migrate both secrets in lock-step.
 *   - The endpoint only reads `x-signature`; body, headers, and signature
 *     flow through the SDK as-is.
 *
 * Lifecycle:
 *   - Autonoma-managed preview deploys set `AUTONOMA_PREVIEWKIT` —
 *     per the SDK docs those previews are isolated and disposable,
 *     so we mount the route even if `NODE_ENV=production` is also set.
 *   - For non-preview production deploys we 404 so a misconfigured
 *     deploy can't seed test data on a live cluster.
 */

import { NextResponse, type NextRequest } from "next/server";
import { handleRequest } from "@autonoma-ai/sdk";

import { factories } from "@/lib/autonoma/factories";
import { buildAuthPayload } from "@/lib/autonoma/auth";
import { isAutonomaEndpointEnabled } from "@/lib/autonoma/endpointAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Autonoma can inject this only into the Vercel Preview selected for SDK
// validation. `isAutonomaEndpointEnabled` requires that injection before it
// exposes this route on a production-mode Vercel deployment.
const SHARED_SECRET = process.env.AUTONOMA_SHARED_SECRET;
// Signing secret precedence: SDK-canonical name first (so anyone
// following the docs finds it), fall back to the legacy gameplay-state
// HMAC key for backward-compat with existing deploys.
const SIGNING_SECRET =
  process.env.AUTONOMA_SIGNING_SECRET ?? process.env.CHECKSUM_SECRET;

async function handlePost(request: NextRequest) {
  // A Vercel Preview is permitted only when Autonoma injected its HMAC key.
  // Vercel Production remains disabled even if that key exists there.
  if (!isAutonomaEndpointEnabled()) {
    return NextResponse.json(
      { error: "Autonoma endpoint is disabled in production" },
      { status: 404 },
    );
  }

  if (!SHARED_SECRET || !SIGNING_SECRET) {
    return NextResponse.json(
      {
        error:
          "Autonoma endpoint requires AUTONOMA_SHARED_SECRET and AUTONOMA_SIGNING_SECRET (or legacy CHECKSUM_SECRET fallback)",
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
  console.info(`[autonoma] handleRequest action=${action} bytes=${raw.length}`);
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
  console.info(
    `[autonoma] handleRequest action=${action} → status=${result.status}`,
  );

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

// Next.js App Router requires `export async function POST/GET` per the
// route segment conventions — even when the body just delegates. The
// `require-await` lint rule is suppressed for the two wrappers; they
// return a `Promise<NextResponse>` from the async helper so the
// runtime contract is preserved.
// eslint-disable-next-line require-await
export async function POST(request: NextRequest) {
  return handlePost(request);
}

// eslint-disable-next-line require-await
export async function GET(request: NextRequest) {
  // Some SDKs probe GET for health; we mirror POST so a wrong verb still
  // returns the discover schema. The SDK itself routes by `action` field
  // in the body, so this is harmless either way.
  return handlePost(request);
}
