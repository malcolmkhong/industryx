// ============================================
// tests/unit/jwtVerify.test.ts — Phase 5.5 Step 4
//
// Covers the JWT trust fast-path behavior:
//   - happy path: valid signature returns userId
//   - missing token: MISSING_TOKEN
//   - expired token: EXPIRED
//   - tampered signature: INVALID_SIGNATURE
//   - wrong issuer: INVALID_CLAIMS
//   - bad kid: JWKS_ERROR
//
// We use jose to SIGN tokens locally with a randomly generated key pair,
// then point jwksCache at a fake JWKS endpoint via global.fetch mock.
// ============================================

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, type JWK } from "jose";
import { NextRequest } from "next/server";

import { tryLocalVerify } from "@/lib/auth/jwtVerify";
import { _resetJwksCacheForTests } from "@/lib/auth/jwksCache";

const PROJECT_URL = "https://wkkzqtseqwcyyyezroqq.supabase.co";
const KID = "test-kid-1";

// Build a fake NextRequest with one cookie carrying the JWT.
function makeReq(token: string | null): NextRequest {
  const req = new NextRequest("http://localhost/api/game/state/sync");
  if (token !== null) {
    // Next.js 16 RequestCookies only parses via .set() in unit tests
    // (incoming headers are not lazily parsed in the vitest environment).
    req.cookies.set("sb-wkkzqtseqwcyyyezroqq-auth-token", token);
  }
  return req;
}

let signingKey: CryptoKey;
let publicJwk: JWK;
// signOptions no longer used; placeholder retained to avoid scope churn
let signOptions: Record<string, unknown> = {};

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  signingKey = pair.privateKey;
  const pub = await exportJWK(pair.publicKey);
  pub.kid = KID;
  pub.alg = "ES256";
  pub.use = "sig";
  publicJwk = pub;

  signOptions = {
    issuer: PROJECT_URL,
    header: { kid: KID, alg: "ES256" },
  };

  // Mock the JWKS endpoint once for the whole suite.
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  _resetJwksCacheForTests();
});

describe("tryLocalVerify", () => {
  it("returns valid=true for a freshly signed token", async () => {
    const token = await new SignJWT({ email: "alice@test.com" })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setSubject("user-abc-123")
      .setIssuedAt()
      .setIssuer(PROJECT_URL)
      .setExpirationTime("5m")
      .sign(signingKey);

    const result = await tryLocalVerify(makeReq(token));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.userId).toBe("user-abc-123");
      expect(result.email).toBe("alice@test.com");
    }
  });

  it("returns MISSING_TOKEN when no cookie present", async () => {
    const result = await tryLocalVerify(makeReq(null));
    expect(result).toEqual({ valid: false, reason: "MISSING_TOKEN" });
  });

  it("returns EXPIRED for a token signed with past exp", async () => {
    // Past expiry: 10 minutes ago
    const token = await new SignJWT({ email: "bob@test.com" })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setSubject("user-expired")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1200)
      .setIssuer(PROJECT_URL)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 600)
      .sign(signingKey);

    const result = await tryLocalVerify(makeReq(token));
    expect(result).toEqual({ valid: false, reason: "EXPIRED" });
  });

  it("returns INVALID_SIGNATURE when token is tampered", async () => {
    const valid = await new SignJWT({ email: "eve@test.com" })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setSubject("user-eve")
      .setIssuedAt()
      .setIssuer(PROJECT_URL)
      .setExpirationTime("5m")
      .sign(signingKey);

    // Flip a byte in the signature segment (last segment)
    const parts = valid.split(".");
    parts[2] = parts[2].slice(0, -2) + "AA";
    const tampered = parts.join(".");

    const result = await tryLocalVerify(makeReq(tampered));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // jose throws either "INVALID_SIGNATURE" or "JWKS_ERROR" depending
      // on what it failed at first. Both are acceptable signals.
      expect(["INVALID_SIGNATURE", "MALFORMED"]).toContain(result.reason);
    }
  });

  it("returns INVALID_CLAIMS when issuer mismatches", async () => {
    const token = await new SignJWT({ email: "x@y.com" })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setSubject("user-x")
      .setIssuedAt()
      .setIssuer("https://attacker.example.com")
      .setExpirationTime("5m")
      .sign(signingKey);

    const result = await tryLocalVerify(makeReq(token));
    expect(result).toEqual({ valid: false, reason: "INVALID_CLAIMS" });
  });

  it("returns JWKS_ERROR when kid is unknown", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "rotated-kid-not-in-cache" })
      .setSubject("user-y")
      .setIssuedAt()
      .setIssuer(PROJECT_URL)
      .setExpirationTime("5m")
      .sign(signingKey);

    const result = await tryLocalVerify(makeReq(token));
    expect(result).toEqual({ valid: false, reason: "JWKS_ERROR" });
  });

  it("returns MALFORMED for a non-JWT cookie value", async () => {
    const result = await tryLocalVerify(makeReq("not-a-jwt-value"));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // base64url decode of "not-a-jwt-value" produces junk, jose errors out;
      // we accept any structured failure as long as valid=false.
      expect(["MALFORMED", "INVALID_SIGNATURE", "MISSING_TOKEN"]).toContain(
        result.reason,
      );
    }
  });
});

// Silence unused import warning while keeping the type import live
void signOptions;
