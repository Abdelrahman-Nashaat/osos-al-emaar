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

/** Public VAPID key — safe in the browser bundle (NEXT_PUBLIC_*). */
export function getVapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
  return key;
}

/** Server-only VAPID material for signing Web Push notifications. */
export function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@osos-al-emaar.com";
  if (!publicKey || !privateKey) throw new Error("Missing VAPID key material (server-only).");
  return { publicKey, privateKey, subject };
}

/** Shared secret the notifications trigger uses to authenticate to /api/push/dispatch. */
export function getPushDispatchSecret(): string {
  const s = process.env.PUSH_DISPATCH_SECRET;
  if (!s) throw new Error("Missing PUSH_DISPATCH_SECRET (server-only).");
  return s;
}

