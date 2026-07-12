/**
 * tests/api/helpers/request.ts
 *
 * Helpers for building Request objects compatible with Next.js App
 * Router route handlers. Use:
 *
 *   const req = buildRequest({ method: 'POST', url: '/api/market/trades/execute',
 *     body: { giveResource: 'iron', giveAmount: 1, ... },
 *     cookies: { sb_token: 'xxx' } });
 *   const res = await POST(req, { params: Promise.resolve({}) });
 *   expect(res.status).toBe(401);
 */

import { NextRequest } from 'next/server';

export interface BuildRequestOptions {
  method?: string;
  url: string;
  // For GET requests, you can pass query parameters here
  query?: Record<string, string>;
  // For POST/PATCH/PUT, body as JSON
  body?: unknown;
  // Form body (will be sent as application/x-www-form-urlencoded)
  formBody?: Record<string, string>;
  // Cookie header (used for auth)
  cookies?: Record<string, string>;
  // Custom headers
  headers?: Record<string, string>;
  // Override the IP for rate-limit tests
  ip?: string;
}

/**
 * Build a NextRequest suitable for passing to a Next.js route handler.
 * The Request will:
 *   - Use the supplied method
 *   - Parse body as JSON if `body` provided
 *   - Set Cookie header from `cookies`
 *   - Set X-Forwarded-For from `ip` (if provided)
 *   - Set custom headers
 *   - Resolve `query` into a search string
 */
export function buildRequest(opts: BuildRequestOptions): NextRequest {
  const url = new URL(opts.url, 'http://localhost:3000');
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.cookies && Object.keys(opts.cookies).length > 0) {
    const cookieStr = Object.entries(opts.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    headers['Cookie'] = cookieStr;
  }
  if (opts.ip) {
    headers['X-Forwarded-For'] = opts.ip;
    headers['X-Real-IP'] = opts.ip;
  }

  let body: BodyInit | undefined;
  let contentType: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    contentType = 'application/json';
  } else if (opts.formBody) {
    body = new URLSearchParams(opts.formBody).toString();
    contentType = 'application/x-www-form-urlencoded';
  }
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return new NextRequest(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
  });
}

/**
 * Build a Next.js route context object.
 * Next.js 16+ passes `params` as a Promise.
 */
export function buildContext<T extends Record<string, string> = Record<string, string>>(
  params: T,
): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

/**
 * Read response body as JSON.
 */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Build a Supabase auth cookie pair (matches what @supabase/ssr sets).
 */
export function authCookies(accessToken: string, refreshToken: string = 'refresh-token') {
  return {
    'sb-access-token': accessToken,
    'sb-refresh-token': refreshToken,
  };
}
