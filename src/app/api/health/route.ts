import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "IndustriaX Backend",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    phase: "1",
    phaseName: "Auth & Security",
  });
}
