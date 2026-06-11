"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Operational tables only (published in 0015). Finance tables are NEVER in the
// publication (locked rule) — finance surfaces stay fresh via the focus refetch
// below plus the post-mutation router.refresh() (B5).
const OPERATIONAL_TABLES = ["tasks", "task_events", "projects", "clients", "project_members"];

/**
 * Live multi-device refresh (Phase 4.5 C2): one throttled channel over the
 * operational publication → router.refresh(), so a manager's assignment shows
 * up on the engineer's phone without a manual reload. RLS filters events per
 * subscriber server-side. Also refetches when the tab regains focus.
 */
export function RealtimeRefresh() {
  const router = useRouter();
  const lastRefresh = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) return; // already scheduled
      const wait = Math.max(0, 1500 - (Date.now() - lastRefresh.current));
      timer.current = setTimeout(() => {
        timer.current = null;
        lastRefresh.current = Date.now();
        router.refresh();
      }, wait);
    };

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // postgres_changes is RLS-filtered per subscriber: the user's access token
    // must be applied BEFORE the channel joins, or the subscription is
    // evaluated as anon and delivers nothing.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return;
      supabase.realtime.setAuth(session.access_token);
      let ch = supabase.channel("operational-refresh");
      for (const table of OPERATIONAL_TABLES) {
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
      }
      channel = ch.subscribe();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
