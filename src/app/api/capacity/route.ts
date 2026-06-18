// src/app/api/capacity/route.ts
// Public capacity status endpoint. Used by the client for UI hints.
// Server-side enforcement still happens via getCapacityStatus() in API routes.

import { NextResponse } from 'next/server';
import { getCapacityStatus } from '@/lib/capacity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cap = await getCapacityStatus();
  return NextResponse.json(cap);
}
