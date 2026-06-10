import { test, expect } from "@playwright/test";

// Phase 4.5 A6 — /api/health must be a minimal, uncacheable liveness probe.
// It must NEVER expose env-variable presence, key names, or upstream error detail
// (the pre-4.5 shape leaked all three env booleans to anonymous callers).

test("/api/health returns only {status:'ok'} with no-store", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"] ?? "").toContain("no-store");

  const body = (await res.json()) as Record<string, unknown>;
  expect(body).toEqual({ status: "ok" });

  const raw = JSON.stringify(body);
  expect(raw).not.toContain("SUPABASE");
  expect(raw).not.toContain("env");
  expect(raw).not.toContain("detail");
});
