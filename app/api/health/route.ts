import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public liveness probe — intentionally minimal (Phase 4.5 A6). Never expose env
 * presence, key names, or upstream error detail on a public route; deep
 * diagnostics live in the server-only scripts/verify-admin.ts.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
