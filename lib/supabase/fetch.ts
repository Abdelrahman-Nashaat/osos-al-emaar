/**
 * Load-bearing read helper (Phase 4.5 B4). A failed Supabase query must surface
 * as an error boundary — NEVER as an empty list or a zero total (a silent zero
 * on a finance surface destroys trust in the numbers). Use for page-level reads;
 * secondary widgets render their own inline Arabic error instead.
 */
export async function must<T>(
  label: string,
  p: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await p;
  if (error) {
    // Surfaces in the nearest error.tsx; logged server-side for Vercel logs.
    console.error(`[fetch.${label}]`, { message: error.message });
    throw new Error(`fetch_failed: ${label}`);
  }
  return (data ?? ([] as unknown as T)) as T;
}
