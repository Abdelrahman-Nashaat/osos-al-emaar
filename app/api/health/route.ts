import { NextResponse } from "next/server";
import { getHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Phase 0 health endpoint: env presence + Supabase reachability. */
export async function GET() {
  return NextResponse.json(await getHealth());
}
