"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the PWA service worker in production only and surfaces updates:
 * when a new worker takes over (skipWaiting + clients.claim in sw.js), the user
 * gets a reload prompt so they never keep working on a stale build (C1).
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let hadController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });

    const onControllerChange = () => {
      // First controllerchange on a fresh visit is the initial claim — only
      // prompt when an EXISTING controller was replaced (a real update).
      if (!hadController) {
        hadController = true;
        return;
      }
      toast.info("يتوفر تحديث للنظام — أعد التحميل.", {
        duration: 10_000,
        action: { label: "إعادة التحميل", onClick: () => window.location.reload() },
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
