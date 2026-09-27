import { NextRequest, NextResponse } from "next/server";

export function auth(req: NextRequest) {
  return {
    token: req.headers.get("x-member-token"),
    organiserKey: req.headers.get("x-organiser-key"),
  };
}

export function fail(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export type Ctx = { params: Promise<{ id: string }> };
