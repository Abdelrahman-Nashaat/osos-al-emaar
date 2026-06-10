import { z } from "zod";

/**
 * Environment contract for the app.
 *
 * - Public vars are safe in the browser bundle (NEXT_PUBLIC_*).
 * - The service-role key is SERVER-ONLY and must never be read in client code
 *   (Amendment 2). It is intentionally not part of the public schema.
 *
 * Accessors validate at call time (inside request handlers / client factories),
 * never at module load, so a missing var never breaks `next build`.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function getPublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing/invalid public Supabase env: ${missing}`);
  }
  return parsed.data;
}

/** Server-only. Throws if called without the service-role key configured. */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only).");
  return key;
}

