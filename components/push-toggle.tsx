"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push/client";

/**
 * «تفعيل الإشعارات» — per-device Web Push opt-in, shown in the notifications
 * panel. Subscribes through the browser Push API and persists the subscription
 * via the `push_subscribe` definer RPC (own-row only). Progressive: renders
 * nothing where Push is unsupported (e.g. iOS Safari before install).
 */
// Public VAPID key — a NEXT_PUBLIC_ var Next inlines into the client bundle.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported() || !VAPID_PUBLIC_KEY) return;
    let cancelled = false;
    // Defer setState out of the effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      if (!cancelled) setSupported(true);
    });
    // Reflect the current subscription state once the SW is ready (production).
    // In dev the SW isn't registered, so this never resolves — the toggle still
    // shows, defaulting to «تفعيل الإشعارات».
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setOn(Boolean(sub));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const sub = await subscribeToPush(VAPID_PUBLIC_KEY);
      if (!sub) {
        toast.error("لم يُمنح إذن الإشعارات.");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.rpc("push_subscribe", {
        p_endpoint: sub.endpoint,
        p_p256dh: sub.p256dh,
        p_auth: sub.auth,
        p_ua: navigator.userAgent,
      });
      if (error) throw error;
      setOn(true);
      toast.success("تم تفعيل الإشعارات على هذا الجهاز.");
    } catch {
      toast.error("تعذّر تفعيل الإشعارات.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) {
        const supabase = createClient();
        await supabase.rpc("push_unsubscribe", { p_endpoint: endpoint });
      }
      setOn(false);
      toast.success("تم إيقاف الإشعارات على هذا الجهاز.");
    } catch {
      toast.error("تعذّر إيقاف الإشعارات.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={on ? disable : enable}
      disabled={busy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {on ? <BellOff className="size-3.5" /> : <BellRing className="size-3.5" />}
      {on ? "إيقاف الإشعارات" : "تفعيل الإشعارات"}
    </button>
  );
}
