import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVapidKeys, getPushDispatchSecret } from "@/lib/env";
import { buildPushPayload, isStaleStatus } from "@/lib/push/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The proxy matcher excludes /api/* — this route self-authenticates via a shared
// bearer secret used ONLY by the notifications trigger (pg_net). It reads
// subscriptions with the service role (server-only) and prunes dead endpoints.

// Constant-time compare so the bearer check can't leak the secret via timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  let expected: string;
  try {
    expected = `Bearer ${getPushDispatchSecret()}`;
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!safeEqual(auth, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let notificationId: number | null = null;
  try {
    const body = (await request.json()) as { notification_id?: number };
    notificationId = typeof body.notification_id === "number" ? body.notification_id : null;
  } catch {
    /* fallthrough */
  }
  if (notificationId == null) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: n } = await admin
    .from("notifications")
    .select("id, user_id, type, title, body, href")
    .eq("id", notificationId)
    .single();
  if (!n) return NextResponse.json({ ok: true, sent: 0 });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", n.user_id);
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { publicKey, privateKey, subject } = getVapidKeys();
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = buildPushPayload(n);

  let sent = 0;
  const stale: number[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 0;
        if (isStaleStatus(status)) stale.push(s.id);
      }
    }),
  );
  if (stale.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", stale);
  }
  return NextResponse.json({ ok: true, sent, pruned: stale.length });
}
