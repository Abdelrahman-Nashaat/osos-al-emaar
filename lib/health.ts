import { envStatus, getPublicEnv } from "@/lib/env";

export type HealthResult = {
  env: ReturnType<typeof envStatus>;
  supabase: { status: "ok" | "not_configured" | "error"; detail?: string };
};

/**
 * Phase 0 connection check: confirms the configured Supabase project is
 * reachable using only the public anon key. Does NOT touch any table or data.
 */
export async function getHealth(): Promise<HealthResult> {
  const env = envStatus();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { env, supabase: { status: "not_configured" } };
  }
  try {
    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
    const res = await fetch(`${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY },
      cache: "no-store",
    });
    if (!res.ok) {
      return { env, supabase: { status: "error", detail: `HTTP ${res.status}` } };
    }
    return { env, supabase: { status: "ok" } };
  } catch (e) {
    return {
      env,
      supabase: { status: "error", detail: e instanceof Error ? e.message : "unknown error" },
    };
  }
}
