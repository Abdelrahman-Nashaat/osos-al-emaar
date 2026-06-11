"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NotificationRow = {
  id: number;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * «الإشعارات» — header bell with unread badge. Rows come from the user's own
 * RLS-filtered notifications stream; new inserts arrive over the Realtime
 * channel (setAuth-before-subscribe, same fix as RealtimeRefresh) and surface
 * as a toast. Opening the panel marks the visible unread rows as read through
 * the DEFINER function (no client UPDATE policy exists).
 */
export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const load = useCallback(async () => {
    const supabase = (supabaseRef.current ??= createClient());
    const [{ data: rows }, { count }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, title, body, href, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
    ]);
    setItems(rows ?? []);
    setUnread(count ?? 0);
  }, []);

  useEffect(() => {
    const supabase = (supabaseRef.current ??= createClient());
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Initial fetch happens inside the session callback (async, not in the
    // effect body) — react-hooks/set-state-in-effect.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      void load();
      if (!session) return;
      supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel("notifications-stream")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            const n = payload.new as NotificationRow;
            toast.info(n.title, { description: n.body ?? undefined });
            void load();
            router.refresh();
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabaseRef.current?.removeChannel(channel);
    };
  }, [load, router]);

  // Opening the panel marks the listed unread rows read (badge clears).
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      const unreadIds = items.filter((i) => !i.read_at).map((i) => i.id);
      if (unreadIds.length > 0) {
        const supabase = (supabaseRef.current ??= createClient());
        void supabase.rpc("notifications_mark_read", { p_ids: unreadIds }).then(() => void load());
      }
    }
  };

  const markAll = () => {
    const supabase = (supabaseRef.current ??= createClient());
    void supabase.rpc("notifications_mark_all_read").then(() => void load());
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-10"
          aria-label={unread > 0 ? `الإشعارات (${unread} غير مقروء)` : "الإشعارات"}
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute end-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-white"
            >
              {unread > 9 ? "+9" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">الإشعارات</p>
          {items.some((i) => !i.read_at) || unread > 0 ? (
            <button
              type="button"
              onClick={markAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              تحديد الكل كمقروء
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              لا توجد إشعارات بعد.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const inner = (
                  <div className={cn("px-3 py-2.5", !n.read_at && "bg-secondary/50")}>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body ? (
                      <p className="truncate text-sm text-muted-foreground" dir="auto">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(n.created_at)}
                    </p>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href} onClick={() => setOpen(false)} className="block hover:bg-muted">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
